-- 0044_drop_withdrawal_flow.sql
-- Hapus seluruh flow withdrawal (penarikan saldo owner) — tidak lagi dipakai.
-- Owner kini: (1) connect payment gateway langsung via dashboard, atau
-- (2) pakai voucher untuk pembayaran offline / potongan nominal.
--
-- Objek yang dihapus:
--   - Tabel `withdrawals` (permintaan penarikan owner).
--   - Tabel `balances` (saldo owner, hanya diisi oleh withdrawal flow).
--   - Tabel `balance_ledger` (audit mutasi saldo, hanya dipakai withdrawal).
--   - RPC `withdrawable_payments_sum` (ceiling penarikan).
--   - Setting platform `min_withdrawal_amount`, `withdrawal_days`,
--     `withdrawal_sla_hours`.
--
-- `settle_paid_payment_atomically` di-replace tanpa branch balance-credit:
-- webhook paid tetap settle transaksi/voucher, tapi tidak lagi mengkredit
-- saldo owner (tidak ada lagi saldo/withdrawal).
--
-- Kolom `transactions.withdrawable` (migrasi 0033) TETAP dipertahankan:
-- menandai transaksi manual/offline untuk reporting (badge Non-Withdrawable).

-- 1. Patch settle_paid_payment_atomically: hapus balance-credit + ledger.
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

  return query select (
    select number from transactions where id = v_transaction_id
  ), coalesce(v_checkout.result_token, p_result_token), v_settled_now;
end;
$$;

-- 2. Drop RPC + tabel.
drop function if exists withdrawable_payments_sum(uuid);
drop table if exists withdrawals;
drop table if exists balance_ledger;
drop table if exists balances;

-- 3. Hapus setting withdrawal.
delete from platform_settings where key in
  ('min_withdrawal_amount', 'withdrawal_days', 'withdrawal_sla_hours');

-- 4. Post-check: tidak ada referensi balances/balance_ledger/withdrawals tersisa.
do $$
begin
  if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and c.relname in ('balances','balance_ledger','withdrawals')) then
    raise exception '[0044] ASSERT FAIL: withdrawal tables still exist';
  end if;
  if exists (select 1 from pg_proc where proname = 'withdrawable_payments_sum') then
    raise exception '[0044] ASSERT FAIL: withdrawable_payments_sum still exists';
  end if;
  if exists (select 1 from platform_settings where key like 'withdrawal_%' or key = 'min_withdrawal_amount') then
    raise exception '[0044] ASSERT FAIL: withdrawal settings still exist';
  end if;
  raise notice '[0044] withdrawal flow dropped OK.';
end$$;
