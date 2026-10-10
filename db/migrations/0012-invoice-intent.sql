-- 0012: intent pada invoice — pembayaran-first untuk plan & add-on (docs/02).
-- Saat owner memilih plan / membeli add-on, invoice pending terbit dengan
-- intent; plan/add-on baru diaktifkan SETELAH invoice dibayar (webhook/poll).
-- intent: {"type":"plan_change","plan_id","code","name"}
--       | {"type":"add_on","add_on_id","code","name"}
-- Idempotent — aman dijalankan berulang / pada baseline schema baru.

alter table invoices add column if not exists intent jsonb;
