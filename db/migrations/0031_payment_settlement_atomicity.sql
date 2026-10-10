-- Payment invariants: one open checkout per booth, one transaction/ledger/usage per payment.

-- Keep newest checkout before enforcing the booth reservation invariant.
with ranked as (
  select id, row_number() over (partition by photobox_id order by created_at desc, id desc) as position
    from checkout_sessions
   where status = 'open' and photobox_id is not null
)
update checkout_sessions c
   set status = 'expired'
  from ranked r
 where c.id = r.id and r.position > 1;

update payments p
   set status = 'expired'
 where p.status in ('creating', 'pending')
   and exists (
     select 1 from checkout_sessions c where c.id = p.checkout_session_id and c.status = 'expired'
   );

create unique index if not exists uq_checkout_open_per_photobox
  on checkout_sessions (photobox_id)
  where status = 'open' and photobox_id is not null;

alter table transactions add column if not exists payment_id uuid references payments (id) on delete set null;
update transactions t
   set payment_id = p.id
  from payments p
 where p.transaction_id = t.id and t.payment_id is null;
create unique index if not exists uq_transaction_payment
  on transactions (payment_id) where payment_id is not null;

alter table voucher_usages add column if not exists payment_id uuid references payments (id) on delete set null;
update voucher_usages vu
   set payment_id = p.id
  from payments p
 where p.transaction_id = vu.transaction_id and vu.payment_id is null;
delete from voucher_usages vu
 where vu.payment_id is not null
   and exists (
     select 1 from voucher_usages newer
      where newer.payment_id = vu.payment_id
        and newer.id > vu.id
   );
create unique index if not exists uq_voucher_usage_payment
  on voucher_usages (payment_id) where payment_id is not null;
create unique index if not exists uq_voucher_usage_transaction
  on voucher_usages (transaction_id) where transaction_id is not null;

-- Existing duplicate payment credits require balance reconciliation; fail closed.
do $$
begin
  if exists (
    select 1 from balance_ledger
     where source = 'payment' and source_id is not null
     group by source, source_id having count(*) > 1
  ) then
    raise exception 'duplicate payment credits require balance reconciliation before 0031';
  end if;
end;
$$;
create unique index if not exists uq_ledger_payment_source
  on balance_ledger (source, source_id) where source = 'payment';

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
  v_balance_after integer;
  v_fee integer;
  v_credit integer;
  v_percent numeric;
  v_flat integer;
  v_settled_now boolean := false;
begin
  select * into v_payment from payments where id = p_payment_id for update;
  if not found or v_payment.status <> 'paid' then raise exception 'paid payment not found'; end if;
  select * into v_checkout from checkout_sessions where id = v_payment.checkout_session_id for update;
  if not found then raise exception 'checkout not found'; end if;

  v_transaction_id := v_payment.transaction_id;
  if v_transaction_id is null then
    insert into transactions (
      business_id, outlet_id, photobox_id, package_id, payment_id, payment_method,
      gross_amount, discount_amount, final_amount, voucher_id, status, number, paid_at
    ) values (
      v_payment.business_id, v_payment.outlet_id, v_payment.photobox_id, v_payment.package_id,
      v_payment.id,
      case when v_payment.provider = 'cash' then 'cash'
           when v_payment.credential_id is not null then 'gateway' else 'qris' end,
      v_payment.gross_amount, v_payment.discount_amount, v_payment.final_amount,
      v_payment.voucher_id, 'paid', p_transaction_number, coalesce(v_payment.paid_at, now())
    ) returning id into v_transaction_id;
    update payments set transaction_id = v_transaction_id where id = v_payment.id;
    v_settled_now := true;
  end if;

  if v_payment.voucher_id is not null then
    insert into voucher_usages (voucher_id, business_id, transaction_id, payment_id, discount_amount)
    values (v_payment.voucher_id, v_payment.business_id, v_transaction_id, v_payment.id, v_payment.discount_amount)
    on conflict (payment_id) where payment_id is not null do nothing;
  end if;

  if v_checkout.status <> 'paid' then
    update checkout_sessions
       set status = 'paid', result_token = coalesce(v_checkout.result_token, p_result_token)
     where id = v_checkout.id;
  end if;

  if v_payment.credential_id is not null and v_payment.final_amount > 0 then
    select plans.platform_fee_percent, plans.platform_fee_flat into v_percent, v_flat
      from subscriptions join plans on plans.id = subscriptions.plan_id
     where subscriptions.business_id = v_payment.business_id
       and subscriptions.status in ('trial', 'active', 'past_due')
     order by subscriptions.created_at desc limit 1;
    v_fee := least(v_payment.final_amount, greatest(0, floor(v_payment.final_amount * coalesce(v_percent, 0) / 100)::integer + coalesce(v_flat, 0)));
    if v_fee > 0 then
      insert into balance_ledger (business_id, type, amount, source, source_id, balance_after)
      values (v_payment.business_id, 'receivable', v_fee, 'platform_fee', v_payment.id, 0)
      on conflict (source, source_id) where source = 'platform_fee' do nothing;
    end if;
  elsif v_payment.provider <> 'cash' and v_payment.final_amount > 0
    and not exists (
      select 1 from balance_ledger where source = 'payment' and source_id = v_payment.id
    ) then
    select plans.platform_fee_percent, plans.platform_fee_flat into v_percent, v_flat
      from subscriptions join plans on plans.id = subscriptions.plan_id
     where subscriptions.business_id = v_payment.business_id
       and subscriptions.status in ('trial', 'active', 'past_due')
     order by subscriptions.created_at desc limit 1;
    v_fee := least(v_payment.final_amount, greatest(0, floor(v_payment.final_amount * coalesce(v_percent, 0) / 100)::integer + coalesce(v_flat, 0)));
    v_credit := v_payment.final_amount - v_fee;
    insert into balances (business_id, available, lifetime_earned)
    values (v_payment.business_id, v_credit, v_credit)
    on conflict (business_id) do update
      set available = balances.available + excluded.available,
          lifetime_earned = balances.lifetime_earned + excluded.lifetime_earned
    returning available into v_balance_after;
    insert into balance_ledger (business_id, type, amount, source, source_id, balance_after)
    values (v_payment.business_id, 'credit', v_credit, 'payment', v_payment.id, v_balance_after)
    on conflict (source, source_id) where source = 'payment' do nothing;
  end if;

  return query select (
    select number from transactions where id = v_transaction_id
  ), coalesce(v_checkout.result_token, p_result_token), v_settled_now;
end;
$$;

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
    discount_amount, final_amount, voucher_id, status, number, paid_at
  ) values (
    p_business_id, v_checkout.outlet_id, v_checkout.photobox_id, v_checkout.package_id, v_payment_id,
    'qris', v_checkout.gross_amount, v_checkout.discount_amount, 0, v_checkout.voucher_id,
    'paid', p_transaction_number, now()
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
