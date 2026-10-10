-- 0042_cleanup_unused_columns.sql
-- Hapus kolom/tabel nol-konsumen dari fase legacy (audit 2026-09-18):
--   - subscriptions.provider / provider_subscription_id (billing internal; tidak pernah dipakai kode)
--   - invoices.due_at (due date tidak dipakai; invoice intent payment-first docs/02)
--   - payment_credentials.webhook_url (URL dihitung dari SnapyOS_PUBLIC_BASE_URL, docs/electron-kiosk-plan B8)
--   - tabel payment_providers (bilangan provider catalog diedantring; lampau dibiarkan)
-- KEPP: plans.price_yearly / billing_cycle / storage_limit_mb (roadmap pricing).

alter table subscriptions drop column if exists provider;
alter table subscriptions drop column if exists provider_subscription_id;
alter table invoices drop column if exists due_at;
alter table payment_credentials drop column if exists webhook_url;

drop table if exists payment_providers;