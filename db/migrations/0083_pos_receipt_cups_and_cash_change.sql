-- 0083 — struk POS jalur CUPS + uang kembali tunai.
--
-- 1. `pos_orders.print_mode` menerima `cups`. 0082 sudah melonggarkan di DB
--    yang menjalankannya; diulang di sini supaya 0083 juga sah berdiri sendiri
--    (idempoten: drop constraint if exists + add).
-- 2. `amount_received`/`change_amount` adalah kolom uang tunai yang nyata —
--    BUKAN menumpang `payment_reference` (itu referensi settlement provider).
--    Keduanya nullable: pembayaran non-tunai dan baris lama tidak punya nilai.
--    `change_amount` WAJIB turunan `amount_received - final_amount`, dan
--    `amount_received` tidak boleh di bawah total order.
--
-- Aditif & idempoten.

begin;

alter table pos_orders drop constraint if exists pos_orders_print_mode_check;
alter table pos_orders
  add constraint pos_orders_print_mode_check
  check (print_mode in ('browser', 'bluetooth', 'cups'));

alter table pos_orders add column if not exists amount_received integer;
alter table pos_orders add column if not exists change_amount integer;

comment on column pos_orders.amount_received is
  'Uang tunai yang diterima kasir (IDR). NULL untuk non-tunai / baris lama.';
comment on column pos_orders.change_amount is
  'Kembalian = amount_received - final_amount. NULL bila amount_received NULL.';

alter table pos_orders drop constraint if exists pos_orders_cash_change_valid;
alter table pos_orders
  add constraint pos_orders_cash_change_valid
  check (
    (amount_received is null and change_amount is null)
    or (
      amount_received >= final_amount
      and change_amount = amount_received - final_amount
    )
  );

-- RPC pembayaran menulis uang tunai + kembalian dalam transaksi yang sama
-- dengan UPDATE status → tidak ada order paid tanpa catatan tunai.
-- Signature lama (10 argumen) dibuang agar tidak ada overload ambigu.
drop function if exists pos_complete_payment(
  uuid, uuid, text, uuid, text, uuid, uuid, integer, integer, integer
);

create or replace function pos_complete_payment(
  p_order_id uuid,
  p_business uuid,
  p_method text,
  p_cashier uuid,
  p_tx_number text,
  p_outlet_id uuid,
  p_photobox_id uuid,
  p_gross integer,
  p_discount integer,
  p_final integer,
  p_amount_received integer default null,
  p_change_amount integer default null
) returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_tx_id uuid;
  v_existing uuid;
begin
  select id into v_existing
    from transactions
   where pos_order_id = p_order_id
   limit 1;
  if v_existing is not null then
    return null;
  end if;

  update pos_orders
     set status = 'paid',
         paid_at = now(),
         payment_method = p_method,
         amount_received = p_amount_received,
         change_amount = p_change_amount
   where id = p_order_id
     and business_id = p_business
     and status = 'pending';

  if not found then
    return null;
  end if;

  insert into transactions (
    business_id, outlet_id, photobox_id, session_id, package_id,
    payment_method, gross_amount, discount_amount, final_amount,
    status, number, pos_order_id, cashier_user_id, paid_at, withdrawable
  ) values (
    p_business, p_outlet_id, p_photobox_id, null, null,
    p_method, p_gross, p_discount, p_final,
    'paid', p_tx_number, p_order_id, p_cashier, now(), false
  )
  returning id into v_tx_id;

  return v_tx_id;
end;
$$;

revoke execute on function pos_complete_payment(
  uuid, uuid, text, uuid, text, uuid, uuid, integer, integer, integer, integer, integer
) from public, anon, authenticated;
grant execute on function pos_complete_payment(
  uuid, uuid, text, uuid, text, uuid, uuid, integer, integer, integer, integer, integer
) to service_role;

commit;
