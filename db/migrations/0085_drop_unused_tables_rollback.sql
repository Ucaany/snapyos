-- Rollback 0085 — buat ulang tabel yang dihapus migrasi forward.
--
-- PERINGATAN: hanya STRUKTUR yang dipulihkan. Data yang sudah dihapus tidak
-- kembali. Tabel legacy (reports, payment_providers, balances, balance_ledger,
-- withdrawals) TIDAK dibuat ulang di sini — rollback masing-masing ada di
-- 0038/0042/0044.
--
-- Idempoten: `create table if not exists` + `drop policy if exists`.

begin;

create table if not exists stickers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  name text not null,
  category text not null default 'text'
    check (category in ('hearts', 'stars', 'sparkles', 'emoji', 'doodles', 'event', 'text')),
  file_url text not null,
  is_active boolean not null default true
);
create index if not exists idx_stickers_business on stickers (business_id, is_active);

create table if not exists package_templates (
  package_id uuid not null references packages (id) on delete cascade,
  template_id uuid not null references templates (id) on delete cascade,
  primary key (package_id, template_id)
);

create table if not exists event_templates (
  event_id uuid not null references events (id) on delete cascade,
  template_id uuid not null references templates (id) on delete cascade,
  primary key (event_id, template_id)
);

create table if not exists device_logs (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references devices (id) on delete cascade,
  level text not null default 'info'
    check (level in ('debug', 'info', 'warn', 'error')),
  category text not null default 'system',
  message text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_device_logs_device_time on device_logs (device_id, created_at desc);

create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  customer_name text not null,
  customer_contact text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  package_id uuid references packages (id) on delete set null,
  outlet_id uuid references outlets (id) on delete set null,
  photobox_id uuid references photoboxes (id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bookings_interval_valid check (ends_at > starts_at),
  constraint bookings_resource_required check (photobox_id is not null or outlet_id is not null)
);
create index if not exists idx_bookings_business_date on bookings (business_id, starts_at);
create extension if not exists btree_gist;
alter table bookings drop constraint if exists bookings_no_overlap_photobox;
alter table bookings add constraint bookings_no_overlap_photobox
  exclude using gist (photobox_id with =, tstzrange(starts_at, ends_at) with &&)
  where (photobox_id is not null and status in ('pending', 'confirmed', 'completed'));
alter table bookings drop constraint if exists bookings_no_overlap_outlet;
alter table bookings add constraint bookings_no_overlap_outlet
  exclude using gist (outlet_id with =, tstzrange(starts_at, ends_at) with &&)
  where (photobox_id is null and status in ('pending', 'confirmed', 'completed'));
drop trigger if exists trg_bookings_updated_at on bookings;
create trigger trg_bookings_updated_at before update on bookings
  for each row execute function set_updated_at();

-- RLS: service_role-only, sama seperti 0064.
alter table if exists stickers enable row level security;
alter table if exists package_templates enable row level security;
alter table if exists event_templates enable row level security;
alter table if exists device_logs enable row level security;
alter table if exists bookings enable row level security;

drop policy if exists svc_all on stickers;
create policy svc_all on stickers for all to service_role using (true) with check (true);
drop policy if exists svc_all on package_templates;
create policy svc_all on package_templates for all to service_role using (true) with check (true);
drop policy if exists svc_all on event_templates;
create policy svc_all on event_templates for all to service_role using (true) with check (true);
drop policy if exists svc_all on device_logs;
create policy svc_all on device_logs for all to service_role using (true) with check (true);
drop policy if exists svc_all on bookings;
create policy svc_all on bookings for all to service_role using (true) with check (true);

commit;
