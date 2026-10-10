-- Rollback 0063 — kembalikan CHECK payment_method & drop index/FK/kolom index baru.
-- PERINGATAN: rollback ini menghapus 'voucher' dari CHECK. Baris transactions
-- yang sudah memakai payment_method='voucher' HARUS dihapus/diubah lebih dulu,
-- jika tidak `alter table ... add constraint` akan gagal. Jalankan hanya bila
-- yakin tidak ada transaksi voucher.

begin;

-- 4. revert hot-path index.
drop index if exists idx_checkout_session;

-- 3. revert FK.
alter table invoice_payments drop constraint if exists invoice_payments_credential_id_fkey;

-- 2. (tidak revert) `uq_payment_active_per_checkout` duplikat sengaja tidak
--    dibuat ulang — predikat identik dengan `uq_pay_active_per_checkout`.

-- 1. revert CHECK (BUTUH tidak ada baris payment_method='voucher').
delete from transactions where payment_method = 'voucher';
alter table transactions drop constraint if exists transactions_payment_method_check;
alter table transactions add constraint transactions_payment_method_check
  check (payment_method in ('qris', 'cash', 'bank_transfer', 'other', 'offline', 'manual'));

commit;
