-- 0035 — Retensi hasil foto default → 3 hari (keputusan produk #4).
--
-- Sebelumnya default `business_settings.retention_days` = 7 dan validator app
-- membatasi 1..3 → inkonsisten (row baru dari default DB tercipta 7 sehingga
-- gagal saat owner buka form pengaturan). Sekarang default DB dan validator
-- sama-sama 3 hari; row lama > 3 di-clamp ke 3.

alter table business_settings
  alter column retention_days set default 3;

update business_settings
   set retention_days = 3
 where retention_days > 3;

-- Platform-level default (dipakai admin CEO sebagai referensi) — samakan.
update platform_settings
   set value = '3'::jsonb
 where key = 'default_retention_days'
   and value::text::int > 3;
