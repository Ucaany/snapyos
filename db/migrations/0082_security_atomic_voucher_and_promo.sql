-- ---------------------------------------------------------------------------
-- 0082_security_atomic_voucher_and_promo.sql
--
-- Dua temuan audit yang butuh transaksi database (tidak bisa dijamin dari
-- supabase-js karena tiap statement adalah round-trip terpisah):
--
--   C24  apply-voucher bisa menulis ulang total checkout di tengah createPayment.
--        Perbaikan: kunci baris checkout (FOR UPDATE), tolak kalau sudah ada
--        payment creating/pending, tulis total dalam transaksi yang sama.
--
--   C20  pelepasan kuota promo dikunci berdasarkan KODE, bukan invoice yang
--        mengonsumsinya. Dua checkout konkuren sama-sama menurunkan counter
--        untuk satu konsumsi → usage_limit bisa dilewati.
--        Perbaikan: klaim rilis pada baris invoice (promo_released), decrement
--        hanya sekali per invoice.
--
-- Aman dijalankan berulang (create or replace). Tidak mengubah data lama.
-- ---------------------------------------------------------------------------

create or replace function apply_voucher_atomically(
  p_checkout_id uuid,
  p_business_id uuid,
  p_photobox_id uuid,
  p_voucher_id uuid,
  p_discount integer,
  p_final integer
) returns table (
  checkout_id uuid,
  gross_amount integer,
  discount_amount integer,
  final_amount integer,
  reason text
)
language plpgsql
as $$
declare
  v_checkout checkout_sessions%rowtype;
  v_pending integer;
begin
  if p_discount is null or p_final is null or p_discount < 0 or p_final < 0 then
    return query select null::uuid, null::integer, null::integer, null::integer, 'INVALID'::text;
    return;
  end if;

  -- Kunci baris: createPayment yang berjalan bersamaan akan menunggu di sini,
  -- sehingga "tidak ada payment" dan "tulis total" terjadi dalam satu snapshot.
  select * into v_checkout
    from checkout_sessions
   where id = p_checkout_id
     and business_id = p_business_id
     and photobox_id = p_photobox_id
   for update;

  if not found then
    return query select null::uuid, null::integer, null::integer, null::integer, 'NOT_FOUND'::text;
    return;
  end if;

  if v_checkout.status <> 'open' then
    return query select v_checkout.id, v_checkout.gross_amount, v_checkout.discount_amount,
                        v_checkout.final_amount, 'PROCESSED'::text;
    return;
  end if;

  if p_discount > v_checkout.gross_amount then
    return query select null::uuid, null::integer, null::integer, null::integer, 'INVALID'::text;
    return;
  end if;

  select count(*) into v_pending
    from payments
   where checkout_session_id = p_checkout_id
     and status in ('creating', 'pending');

  if v_pending > 0 then
    return query select v_checkout.id, v_checkout.gross_amount, v_checkout.discount_amount,
                        v_checkout.final_amount, 'PAYMENT_EXISTS'::text;
    return;
  end if;

  update checkout_sessions
     set voucher_id = p_voucher_id,
         discount_amount = p_discount,
         final_amount = p_final
   where id = v_checkout.id
     and status = 'open';

  return query
    select c.id, c.gross_amount, c.discount_amount, c.final_amount, 'OK'::text
      from checkout_sessions c
     where c.id = v_checkout.id;
end;
$$;

create or replace function release_subscription_promo_for_invoice(
  p_invoice_id uuid,
  p_code text
) returns text
language plpgsql
as $$
declare
  v_intent jsonb;
begin
  if p_invoice_id is null then return 'NOT_FOUND'; end if;

  select coalesce(intent, '{}'::jsonb) into v_intent
    from invoices
   where id = p_invoice_id
   for update;

  if not found then return 'NOT_FOUND'; end if;

  -- Satu invoice hanya boleh melepas kuota satu kali, walau dua request
  -- konkuren sama-sama melihat invoice yang sama.
  if coalesce(v_intent ->> 'promo_released', 'false') = 'true' then
    return 'ALREADY';
  end if;

  update invoices
     set intent = coalesce(intent, '{}'::jsonb)
                  || jsonb_build_object('promo_released', true,
                                        'promo_released_at', now())
   where id = p_invoice_id;

  update subscription_promos
     set used_count = greatest(used_count - 1, 0)
   where code = upper(trim(p_code))
     and used_count > 0;

  return 'RELEASED';
end;
$$;

revoke execute on function apply_voucher_atomically(uuid, uuid, uuid, uuid, integer, integer)
  from public, anon, authenticated;
revoke execute on function release_subscription_promo_for_invoice(uuid, text)
  from public, anon, authenticated;
grant execute on function apply_voucher_atomically(uuid, uuid, uuid, uuid, integer, integer)
  to service_role;
grant execute on function release_subscription_promo_for_invoice(uuid, text)
  to service_role;
