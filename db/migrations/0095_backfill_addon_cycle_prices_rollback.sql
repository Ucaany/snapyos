-- Rollback 0095 — best-effort kembalikan kolom hasil backfill menjadi NULL.
--
-- PERINGATAN: backfill tidak menyimpan jejak baris mana yang diisi. Rollback
-- ini HANYA mengosongkan nilai yang masih sama persis dengan hasil proporsional
-- 1/7/30/365; harga yang sudah diubah admin (berbeda dari hitungan) TIDAK
-- disentuh. Bila ragu, pulihkan dari backup. Idempoten.

begin;

update add_ons
   set price_daily = null
 where price_monthly is not null
   and price_daily = round(price_monthly::numeric / 30 * 1)::integer;

update add_ons
   set price_weekly = null
 where price_monthly is not null
   and price_weekly = round(price_monthly::numeric / 30 * 7)::integer;

update add_ons
   set price_yearly = null
 where price_monthly is not null
   and price_yearly = round(price_monthly::numeric / 30 * 365)::integer;

commit;
