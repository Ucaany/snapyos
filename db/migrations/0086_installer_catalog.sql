-- 0086 — private Windows installer catalog (nomor 0081 sudah dipakai
-- app_releases di cloud; jangan disamakan).
-- Artifact bytes live in private business-assets storage; URLs are signed at read time.
begin;

create table if not exists installer_catalog (
  id uuid primary key default gen_random_uuid(),
  version text not null,
  channel text not null check (channel in ('stable', 'beta', 'internal')),
  min_windows_version text not null check (min_windows_version in ('10', '11')),
  architecture text not null check (architecture in ('x64', 'x86', 'arm64', 'universal')),
  file_name text not null,
  object_key text not null unique,
  content_type text not null,
  file_size_bytes bigint not null check (file_size_bytes > 0),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  changelog text,
  compatibility_notes text,
  is_active boolean not null default true,
  is_deprecated boolean not null default false,
  published_at timestamptz,
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (version, channel, architecture)
);
create index if not exists idx_installer_catalog_published
  on installer_catalog (published_at, channel, is_active, is_deprecated, created_at desc);
drop trigger if exists trg_installer_catalog_updated_at on installer_catalog;
create trigger trg_installer_catalog_updated_at before update on installer_catalog
  for each row execute function set_updated_at();

alter table installer_catalog enable row level security;
revoke all on installer_catalog from anon, authenticated;
grant all on installer_catalog to service_role;
drop policy if exists svc_all on installer_catalog;
create policy svc_all on installer_catalog for all to service_role using (true) with check (true);

commit;
