-- 0046 — Pakasir v2: simpan txn_id (provider_ref) untuk status lookup.
-- v2 endpoint transaction-status membutuhkan txn_id, bukan order_id.
-- Kolom provider_ref diisi saat create QRIS; getStatus fallback ke order_id
-- untuk legacy payment in-flight yang dibuat sebelum migrasi v1→v2.

alter table payments
  add column if not exists provider_ref text;

alter table invoice_payments
  add column if not exists provider_ref text;
