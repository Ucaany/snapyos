-- 0085 — Hapus tabel Supabase yang tidak lagi dipakai aplikasi.
--
-- Bukti (audit 2026-11-11): tidak ada satu pun referensi di `src/`, `runtime/`,
-- `scripts/`, atau `deploy/` untuk tabel-tabel berikut:
--   - bookings          — fitur booking belum pernah dibangun (masih backlog).
--   - device_logs       — dibuat 0027, tidak pernah ditulis/dibaca kode.
--   - event_templates   — tabel join event↔template, fitur event mode belum ada.
--   - package_templates — assign template ke paket kini lewat plan limit/template
--                         default booth, bukan tabel join ini.
--   - stickers          — modul stiker dihapus; builder memakai overlay teks.
--
-- Tabel legacy di bawah sudah di-drop migrasi lama (0038, 0042, 0044). Drop
-- ulang dengan `if exists` supaya skrip ini tetap aman bila migrasi lama belum
-- diterapkan di environment tertentu:
--   reports, payment_providers, balances, balance_ledger, withdrawals.
--
-- PERINGATAN: destruktif dan tidak bisa dibatalkan kecuali lewat rollback
-- 0085_drop_unused_tables_rollback.sql (struktur kosong; data tidak kembali).
-- Idempoten: `drop table if exists` aman dijalankan berulang.

begin;

-- 1) Laporkan isi tabel sebelum dihapus (supaya terlihat bila ada data nyata).
do $$
declare
  t text;
  n bigint;
begin
  foreach t in array array[
    'bookings', 'device_logs', 'event_templates', 'package_templates', 'stickers',
    'reports', 'payment_providers', 'balances', 'balance_ledger', 'withdrawals'
  ]
  loop
    if to_regclass('public.' || t) is not null then
      execute format('select count(*) from public.%I', t) into n;
      raise notice '0085: tabel % berisi % baris, akan dihapus', t, n;
    else
      raise notice '0085: tabel % tidak ada, dilewati', t;
    end if;
  end loop;
end;
$$;

-- 2) Drop tabel yang tidak dipakai (leaf tables — tidak ada tabel lain yang
--    mereferensikannya; cascade hanya membersihkan index/policy/trigger).
drop table if exists public.device_logs cascade;
drop table if exists public.event_templates cascade;
drop table if exists public.package_templates cascade;
drop table if exists public.stickers cascade;
drop table if exists public.bookings cascade;

-- 3) Legacy yang sudah di-drop migrasi lama; jaga idempotensi.
drop table if exists public.reports cascade;
drop table if exists public.payment_providers cascade;
drop table if exists public.balances cascade;
drop table if exists public.balance_ledger cascade;
drop table if exists public.withdrawals cascade;

-- 4) Post-check: gagal keras bila masih ada yang tersisa.
do $$
declare
  tersisa text;
begin
  select string_agg(c.relname, ', ')
  into tersisa
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and c.relname in (
      'bookings', 'device_logs', 'event_templates', 'package_templates', 'stickers',
      'reports', 'payment_providers', 'balances', 'balance_ledger', 'withdrawals'
    );

  if tersisa is not null then
    raise exception '0085 gagal: tabel masih ada: %', tersisa;
  end if;

  raise notice '0085 selesai: semua tabel tak terpakai sudah dihapus';
end;
$$;

commit;
