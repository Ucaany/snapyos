-- 0047 — Invoice subscription payment via direct merchant credential.
-- Menyelaraskan invoice_payments dengan payments (0027): simpan credential_id
-- agar QRIS invoice dapat dibayar via Midtrans/Tripay/Pakasir direct merchant
-- yang dikonfigurasi owner di Settings Payment (bukan hanya aggregator Pakasir).
-- NULL = aggregator mode (fallback env var).

alter table invoice_payments
  add column if not exists credential_id uuid
  references payment_credentials (id) on delete set null;
