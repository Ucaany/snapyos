-- 0081 — Katalog aplikasi (admin / CEO): tabel app_releases.
--
-- Hanya TAUTAN yang disimpan. File APK/EXE diunggah admin ke Google Drive (atau
-- host lain); tidak ada upload ke storage SNAPY OS, tidak ada bucket baru,
-- tidak ada presigned PUT. Karena itu tidak ada kolom storage_key/object_id.
--
-- file_size_bytes & sha256 nullable dan diisi MANUAL: server tidak boleh
-- HEAD/GET URL sembarang (SSRF), jadi tidak ada yang bisa memverifikasinya.
-- Check `^https://` adalah garis pertahanan terakhir, bukan satu-satunya —
-- validasi Zod (appReleaseSchema) tetap wajib dan lebih ketat.
--
-- Additive-only. Rollback: 0081_app_releases_rollback.sql.

begin;

create table if not exists app_releases (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  download_url text not null check (download_url ~ '^https://'),
  file_name text not null,
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes > 0),
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  release_notes text,
  is_active boolean not null default true,
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_app_releases_active on app_releases (is_active, created_at desc);

drop trigger if exists trg_app_releases_updated_at on app_releases;
create trigger trg_app_releases_updated_at before update on app_releases
  for each row execute function set_updated_at();

-- Pola 0064: RLS ON, tutup anon/authenticated, izinkan penuh service_role.
alter table app_releases enable row level security;
revoke all on app_releases from anon, authenticated;
grant all on app_releases to service_role;
drop policy if exists svc_all on app_releases;
create policy svc_all on app_releases for all to service_role using (true) with check (true);

commit;
