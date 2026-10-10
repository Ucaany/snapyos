-- 0063 — Voucher payment_method CHECK + index/FK drift convergence.
--
-- Latar: `create_voucher_payment_atomically` (0059) menulis
-- `transactions.payment_method='voucher'`, tetapi CHECK
-- `transactions_payment_method_check` tidak pernah memasukkan nilai 'voucher'
-- → setiap checkout voucher-only (final_amount=0) gagal di settle dengan
-- "check constraint violation". File ini menyelaraskan:
--
-- 1) transactions.payment_method: tambah 'voucher'.
-- 2) drop partial-unique index lama duplikat `uq_payment_active_per_checkout`
--    (0029) — 0059 sudah membuat `uq_pay_active_per_checkout` dengan predikat
--    identik, tanpa drop nama lama. DB hasil migrasi membawa keduanya.
-- 3) invoice_payments.credential_id FK ke payment_credentials (0047) yang
--    absen di baseline schema.sql — selaraskan fresh vs migrated.
-- 4) index checkout_sessions(session_id) untuk hot path finalize/result lookup.
--
-- Idempotent & aman diulang.

begin;

-- 1. Voucher payment method.
alter table transactions drop constraint if exists transactions_payment_method_check;
alter table transactions add constraint transactions_payment_method_check
  check (payment_method in ('qris', 'cash', 'bank_transfer', 'other', 'offline', 'manual', 'voucher'));

-- 2. Duplicate partial-unique index (0029 → 0059 rename).
drop index if exists uq_payment_active_per_checkout;

-- 3. Missing FK on invoice_payments.credential_id (present in 0047, absent in baseline).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'invoice_payments_credential_id_fkey'
  ) then
    alter table invoice_payments
      add constraint invoice_payments_credential_id_fkey
      foreign key (credential_id) references payment_credentials (id) on delete set null;
  end if;
end $$;

-- 4. Hot-path index.
create index if not exists idx_checkout_session on checkout_sessions (session_id);

commit;
