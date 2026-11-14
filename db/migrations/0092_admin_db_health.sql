-- 0092: metrik kesehatan database untuk halaman admin (Supabase / Postgres).
--
-- Hanya mengembalikan agregat angka — tidak ada data tenant. Fungsi dibatasi
-- ke service_role karena panel admin memakai service-role client di server
-- (src/server/admin/platform-health.ts). Bila migrasi ini belum dijalankan,
-- UI menampilkan angka tersebut sebagai "—" tanpa error.

create or replace function public.admin_db_health()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select jsonb_build_object(
    'database_size_bytes', pg_database_size(current_database()),
    'active_connections',
      (select count(*)::int from pg_stat_activity where datname = current_database()),
    'max_connections', current_setting('max_connections')::int,
    'cache_hit_ratio',
      (
        select coalesce(
          round(sum(blks_hit) * 100.0 / nullif(sum(blks_hit) + sum(blks_read), 0), 2),
          0
        )
        from pg_stat_database
        where datname = current_database()
      )
  );
$$;

revoke all on function public.admin_db_health() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.admin_db_health() from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.admin_db_health() from authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.admin_db_health() to service_role;
  end if;
end $$;
