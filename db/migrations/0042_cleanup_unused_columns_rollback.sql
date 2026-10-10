-- 0042_cleanup_unused_columns_rollback.sql
-- Kembalikan kolom/tabel bila migration 0042 harus di-revert.

alter table subscriptions add column if not exists provider text;
alter table subscriptions add column if not exists provider_subscription_id text;
alter table invoices add column if not exists due_at timestamptz;
alter table payment_credentials add column if not exists webhook_url text;

create table if not exists payment_providers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  is_active boolean not null default true,
  config jsonb not null default '{}'::jsonb
);