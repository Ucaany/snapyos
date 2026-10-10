-- 0036 — Hapus payment_method='gateway' (legacy direct-merchant tag).
--
-- Konteks:
--   Sejak 0027 kita memperkenalkan payment_method='gateway' untuk membedakan
--   direct-merchant (owner) dari agregator Pakasir ('qris'). Perbedaan itu
--   sudah tercermin di kolom `credential_id` pada tabel payments (null = via
--   platform Pakasir; non-null = direct merchant owner). Menyimpan tag
--   terpisah di transactions hanya membingungkan report (dua bucket QRIS
--   untuk konsumen yang sama) dan bertabrakan dengan validator/analytics.
--
--   Sekarang: baris lama `payment_method='gateway'` → 'qris'; enum CHECK
--   diperbarui tanpa 'gateway'. RPC `settle_qris_payment` diperbarui
--   memakai 'qris' saja untuk QRIS-based settlement.

update transactions
   set payment_method = 'qris'
 where payment_method = 'gateway';

alter table transactions
  drop constraint if exists transactions_payment_method_check;

alter table transactions
  add constraint transactions_payment_method_check
  check (payment_method in ('qris', 'cash', 'bank_transfer', 'other', 'offline', 'manual'));

-- Re-emit RPC settle_qris_payment: kolom payment_method sekarang 'qris' /
-- 'cash' saja (direct merchant tidak dibedakan lagi). Semantic idempotency
-- + FOR UPDATE tetap sama seperti 0031.
create or replace function settle_qris_payment(
  p_payment_id uuid,
  p_transaction_number text,
  p_result_token text
)
returns table(
  transaction_id uuid,
  final_amount integer,
  business_id uuid,
  outlet_id uuid,
  package_id uuid,
  photobox_id uuid,
  voucher_id uuid,
  discount_amount integer,
  checkout_session_id uuid,
  settled_now boolean
)
language plpgsql
as $$
declare
  v_payment payments%rowtype;
  v_checkout checkout_sessions%rowtype;
  v_transaction_id uuid;
  v_settled_now boolean := false;
begin
  select * into v_payment from payments where id = p_payment_id for update;
  if not found then raise exception 'payment not found'; end if;

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
      case when v_payment.provider = 'cash' then 'cash' else 'qris' end,
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

  return query
    select v_transaction_id,
           v_payment.final_amount,
           v_payment.business_id,
           v_payment.outlet_id,
           v_payment.package_id,
           v_payment.photobox_id,
           v_payment.voucher_id,
           v_payment.discount_amount,
           v_checkout.id,
           v_settled_now;
end;
$$;
