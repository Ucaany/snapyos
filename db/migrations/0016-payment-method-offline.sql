-- Mode pembayaran offline kiosk (docs/05): transaksi tercatat utk reporting,
-- non-withdrawable by design (saldo HANYA dari jalur QRIS via creditBalance).
alter table transactions
  drop constraint if exists transactions_payment_method_check;
alter table transactions
  add constraint transactions_payment_method_check
    check (payment_method in ('qris', 'cash', 'bank_transfer', 'other', 'offline'));
