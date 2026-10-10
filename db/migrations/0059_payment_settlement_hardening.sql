-- 0059 — Payment settlement hardening + exit-PIN atomic lockout.
--
-- 1) Partial unique index: satu payment aktif (creating/pending) per checkout.
--    Sebelumnya sebuah checkout bisa menghasilkan >1 payment aktif → race settle
--    ganda. Backfill expire duplikat (keep newest, ranked-CTE seperti 0031).
-- 2) settle_paid_payment_atomically di-hardening:
--    (a) anti double-settle: hanya insert transaction bila belum ada payment paid
--        lain di checkout yang sama yang sudah punya transaction.
--    (b) withdrawable = provider <> 'cash' (cash non-withdrawable).
-- 3) create_voucher_payment_atomically: transaction payment_method='voucher'
--    (sebelumnya 'qris') + withdrawable=false.
-- 4) exit_pin_register_failure RPC: increment gagal PIN keluar secara atomik
--    (anti read-modify-write race pada photoboxes.exit_pin_failed_count).

-- ---------------------------------------------------------------------------
-- 1. Partial unique index one active payment per checkout
-- ---------------------------------------------------------------------------

-- Expire duplicate active payments, keeping newest (ranked-CTE pattern, 0031).
with ranked as (
  select id, row_number() over (
           partition by checkout_session_id
           order by created_at desc, id desc
         ) as position
    from payments
   where status in ('creating', 'pending')
)
update payments p
   set status = 'expired'
  from ranked r
 where p.id = r.id and r.position > 1;

create unique index if not exists uq_pay_active_per_checkout
  on payments (checkout_session_id)
  where status in ('creating', 'pending');

-- ---------------------------------------------------------------------------
-- 2. settle_paid_payment_atomically (hardened)
-- ---------------------------------------------------------------------------

create or replace function settle_paid_payment_atomically(
  p_payment_id uuid,
  p_transaction_number text,
  p_result_token text
) returns table (transaction_number text, result_token text, settled_now boolean)
language plpgsql
as $$
declare
  v_payment payments%rowtype;
  v_checkout checkout_sessions%rowtype;
  v_transaction_id uuid;
  v_existing_settled boolean;
  v_settled_now boolean := false;
begin
  select * into v_payment from payments where id = p_payment_id for update;
  if not found or v_payment.status <> 'paid' then raise exception 'paid payment not found'; end if;
  select * into v_checkout from checkout_sessions where id = v_payment.checkout_session_id for update;
  if not found then raise exception 'checkout not found'; end if;

  v_transaction_id := v_payment.transaction_id;
  if v_transaction_id is null then
    -- Anti double-settle: hanya insert bila belum ada payment paid lain di
    -- checkout yang sama yang sudah punya transaction (recovery expired→paid
    -- tidak boleh menghasilkan transaction kedua).
    select exists (
      select 1 from payments p
       where p.checkout_session_id = v_payment.checkout_session_id
         and p.status = 'paid'
         and p.transaction_id is not null
         and p.id <> v_payment.id
    ) into v_existing_settled;

    if not v_existing_settled then
      insert into transactions (
        business_id, outlet_id, photobox_id, package_id, payment_id, payment_method,
        gross_amount, discount_amount, final_amount, voucher_id, withdrawable,
        status, number, paid_at
      ) values (
        v_payment.business_id, v_payment.outlet_id, v_payment.photobox_id, v_payment.package_id,
        v_payment.id,
        case when v_payment.provider = 'cash' then 'cash' else 'qris' end,
        v_payment.gross_amount, v_payment.discount_amount, v_payment.final_amount,
        v_payment.voucher_id,
        (v_payment.provider <> 'cash'),
        'paid', p_transaction_number, coalesce(v_payment.paid_at, now())
      ) returning id into v_transaction_id;
      update payments set transaction_id = v_transaction_id where id = v_payment.id;
      v_settled_now := true;
    end if;
  end if;

  if v_payment.voucher_id is not null and v_transaction_id is not null then
    insert into voucher_usages (voucher_id, business_id, transaction_id, payment_id, discount_amount)
    values (v_payment.voucher_id, v_payment.business_id, v_transaction_id, v_payment.id, v_payment.discount_amount)
    on conflict (payment_id) where payment_id is not null do nothing;
  end if;

  if v_checkout.status <> 'paid' then
    update checkout_sessions
       set status = 'paid', result_token = coalesce(v_checkout.result_token, p_result_token)
     where id = v_checkout.id;
  end if;

  return query select (
    select number from transactions where id = v_transaction_id
  ), coalesce(v_checkout.result_token, p_result_token), v_settled_now;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. create_voucher_payment_atomically (hardened)
-- ---------------------------------------------------------------------------

create or replace function create_voucher_payment_atomically(
  p_checkout_id uuid,
  p_business_id uuid,
  p_payment_reference text,
  p_order_id text,
  p_transaction_number text,
  p_result_token text
) returns table (payment_id uuid, reason text)
language plpgsql
as $$
declare
  v_checkout checkout_sessions%rowtype;
  v_voucher vouchers%rowtype;
  v_payment_id uuid;
  v_transaction_id uuid;
  v_used integer;
begin
  select * into v_checkout from checkout_sessions
   where id = p_checkout_id and business_id = p_business_id for update;
  if not found or v_checkout.status <> 'open' or v_checkout.final_amount <> 0 or v_checkout.voucher_id is null then
    return query select null::uuid, 'INVALID'::text; return;
  end if;
  select * into v_voucher from vouchers where id = v_checkout.voucher_id for update;
  if not found then return query select null::uuid, 'INVALID'::text; return; end if;
  if v_voucher.usage_limit is not null then
    select count(*) into v_used from voucher_usages where voucher_id = v_voucher.id;
    if v_used >= v_voucher.usage_limit then
      return query select null::uuid, 'LIMIT'::text; return;
    end if;
  end if;
  insert into payments (
    business_id, checkout_session_id, outlet_id, photobox_id, package_id, gross_amount,
    discount_amount, voucher_id, final_amount, order_id, payment_reference, total_amount,
    provider, status, paid_at
  ) values (
    p_business_id, v_checkout.id, v_checkout.outlet_id, v_checkout.photobox_id, v_checkout.package_id,
    v_checkout.gross_amount, v_checkout.discount_amount, v_checkout.voucher_id, 0,
    p_order_id, p_payment_reference, 0, 'voucher', 'paid', now()
  ) returning id into v_payment_id;
  insert into transactions (
    business_id, outlet_id, photobox_id, package_id, payment_id, payment_method, gross_amount,
    discount_amount, final_amount, voucher_id, withdrawable, status, number, paid_at
  ) values (
    p_business_id, v_checkout.outlet_id, v_checkout.photobox_id, v_checkout.package_id, v_payment_id,
    'voucher', v_checkout.gross_amount, v_checkout.discount_amount, 0, v_checkout.voucher_id,
    false, 'paid', p_transaction_number, now()
  ) returning id into v_transaction_id;
  insert into voucher_usages (voucher_id, business_id, transaction_id, payment_id, discount_amount)
  values (v_checkout.voucher_id, p_business_id, v_transaction_id, v_payment_id, v_checkout.discount_amount);
  update payments set transaction_id = v_transaction_id where id = v_payment_id;
  update checkout_sessions set status = 'paid', result_token = coalesce(result_token, p_result_token)
   where id = v_checkout.id;
  return query select v_payment_id, 'OK'::text;
end;
$$;

revoke execute on function settle_paid_payment_atomically(uuid, text, text) from public, anon, authenticated;
revoke execute on function create_voucher_payment_atomically(uuid, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function settle_paid_payment_atomically(uuid, text, text) to service_role;
grant execute on function create_voucher_payment_atomically(uuid, uuid, text, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 4. exit_pin_register_failure — atomic PIN failure increment
-- ---------------------------------------------------------------------------

create or replace function exit_pin_register_failure(
  p_photobox_id uuid,
  p_threshold int,
  p_lock_ms bigint
) returns table (locked boolean, failed_count int, locked_until timestamptz)
language plpgsql
as $$
declare
  v_count int;
begin
  update photoboxes
     set exit_pin_failed_count = exit_pin_failed_count + 1
   where id = p_photobox_id
  returning exit_pin_failed_count into v_count;

  if v_count >= p_threshold then
    update photoboxes
       set exit_pin_failed_count = 0,
           exit_pin_locked_until = now() + (p_lock_ms::double precision / 1000.0) * interval '1 second'
     where id = p_photobox_id;
    return query select true, 0, now() + (p_lock_ms::double precision / 1000.0) * interval '1 second';
  else
    return query select false, v_count, null::timestamptz;
  end if;
end;
$$;

revoke execute on function exit_pin_register_failure(uuid, int, bigint) from public, anon, authenticated;
grant execute on function exit_pin_register_failure(uuid, int, bigint) to service_role;
