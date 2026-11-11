-- 0071 — pin `search_path` pada RPC aplikasi (defense-in-depth).
--
-- Latar: 0065 men-lock EXECUTE semua RPC aplikasi ke service_role, tetapi 23 dari
-- 27 fungsi aplikasi tetap memakai search_path default pemanggil. Untuk fungsi
-- SECURITY INVOKER (semuanya di sini) ini bukan eskalasi langsung: penyerang
-- harus sudah bisa membuat objek di skema yang lebih awal dari `public` pada
-- search_path sesi — dan sesi itu hanya milik service_role (PostgREST memakai
-- role anon/authenticated, yang sudah tidak punya EXECUTE sejak 0065).
--
-- Tetap dipin karena tiga alasan:
--   1. Fungsi `language sql` menyimpan body sebagai teks yang di-parse ulang saat
--      dipanggil. Bila search_path berubah di kemudian hari (mis. `alter role
--      service_role set search_path`), resolusi nama tabel/fungsi di dalam body
--      ikut bergeser tanpa ada yang menyentuh file SQL ini.
--   2. `pg_temp` implisit dicari lebih dulu untuk nama RELASI. Memasukkan
--      `pg_temp` secara eksplisit membuat urutan itu terlihat di definisi fungsi,
--      bukan tersembunyi di aturan bawaan.
--   3. Empat fungsi (bootstrap_admin, create_*_with_quota) sudah memakai
--      `set search_path`; 23 sisanya belum — konsistensi definisi memudahkan
--      audit berikutnya.
--
-- Memakai `alter function ... set search_path` (bukan `create or replace`)
-- supaya body TIDAK disalin: tidak ada risiko drift body antara file ini dan
-- migrasi asal fungsi. Idempotent — aman diulang.
--
-- STATUS: ditulis + divalidasi statis (tests/rpc-search-path.test.ts), BELUM
-- di-apply ke Supabase (status: prepared, not executed).
--
-- Rollback: 0071_rpc_search_path_hardening_rollback.sql.

begin;

-- bootstrap_admin (0052) SECURITY DEFINER dengan `set search_path = public` —
-- tanpa `pg_temp`. Untuk fungsi definer, `pg_temp` implisit dicari lebih dulu
-- bagi nama relasi; menyebutnya eksplisit menutup jalur shadowing itu.
alter function bootstrap_admin(text)
  set search_path = public, pg_temp;

-- Transaksi / stok / settlement.
alter function activate_device_atomically(text, text)
  set search_path = public, pg_temp;

alter function pos_complete_payment(uuid, uuid, text, uuid, text, uuid, uuid, integer, integer, integer)
  set search_path = public, pg_temp;

alter function pos_decrement_stock(uuid, uuid, integer)
  set search_path = public, pg_temp;

alter function settle_paid_payment_atomically(uuid, text, text)
  set search_path = public, pg_temp;

alter function create_voucher_payment_atomically(uuid, uuid, text, text, text, text)
  set search_path = public, pg_temp;

alter function exit_pin_register_failure(uuid, integer, bigint)
  set search_path = public, pg_temp;

-- Agregat dashboard / finance / metrics.
alter function dashboard_tx_summary(uuid, timestamptz, timestamptz)
  set search_path = public, pg_temp;

alter function dashboard_daily_revenue(uuid, timestamptz, timestamptz, text)
  set search_path = public, pg_temp;

alter function finance_expense_summary(uuid, date, date)
  set search_path = public, pg_temp;

alter function revenue_breakdown(uuid, timestamptz, timestamptz, text)
  set search_path = public, pg_temp;

alter function tx_insights_summary(uuid, timestamptz, timestamptz, text)
  set search_path = public, pg_temp;

alter function metrics_tx_status(uuid, timestamptz, timestamptz)
  set search_path = public, pg_temp;

alter function metrics_returning_customers(uuid, timestamptz, timestamptz)
  set search_path = public, pg_temp;

alter function metrics_revenue_per_booth(uuid, timestamptz, timestamptz)
  set search_path = public, pg_temp;

alter function metrics_sessions_per_booth(uuid, timestamptz, timestamptz)
  set search_path = public, pg_temp;

alter function metrics_session_summary(uuid, timestamptz, timestamptz)
  set search_path = public, pg_temp;

alter function metrics_popular_package(uuid, timestamptz, timestamptz)
  set search_path = public, pg_temp;

alter function metrics_popular_template(uuid, timestamptz, timestamptz)
  set search_path = public, pg_temp;

alter function staff_directory_today(uuid, timestamptz, timestamptz)
  set search_path = public, pg_temp;

alter function customer_spending(uuid, uuid[])
  set search_path = public, pg_temp;

alter function operational_metrics(uuid, timestamptz, timestamptz)
  set search_path = public, pg_temp;

-- Storage accounting (mutasi kuota tenant).
alter function storage_account_add(uuid, text, text, bigint)
  set search_path = public, pg_temp;

alter function storage_account_sub(uuid, text[])
  set search_path = public, pg_temp;

-- Post-check: setiap RPC aplikasi (bukan trigger) wajib punya search_path terpin.
do $$
declare
  v_missing text;
begin
  select string_agg(p.proname, ', ' order by p.proname) into v_missing
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prokind = 'f'
     and p.proname not in ('set_updated_at')
     and p.proname not like 'tg\_%'
     and not exists (
       select 1 from unnest(coalesce(p.proconfig, '{}')) as c
        where c like 'search_path=%'
     );
  if v_missing is not null then
    raise exception '[0071] ASSERT FAIL: RPC tanpa search_path: %', v_missing;
  end if;
  raise notice '[0071] semua RPC aplikasi punya search_path terpin.';
end$$;

commit;
