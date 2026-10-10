-- 0038_drop_reports_table_rollback.sql
-- Kembalikan tabel `reports` bila migration 0038 harus di-revert.

create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  type text not null
    check (type in ('daily', 'weekly', 'monthly', 'revenue', 'transactions', 'outlet', 'photobox', 'expenses', 'voucher')),
  "from" date,
  "to" date,
  file_url text,
  status text not null default 'queued' check (status in ('queued', 'done', 'error')),
  created_at timestamptz not null default now()
);
create index if not exists idx_reports_business on reports (business_id, type);
