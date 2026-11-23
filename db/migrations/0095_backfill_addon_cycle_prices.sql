-- 0095 — Backfill harga add-on per siklus dari price_monthly.
--
-- 0093 menambah price_daily/price_weekly/price_yearly sebagai kolom nullable.
-- Add-on lama hanya punya price_monthly, sehingga plan daily/weekly/yearly
-- tidak bisa membeli add-on apa pun (addOnPriceForCycle → null).
--
-- Proporsional 1/7/30/365 hari, hanya mengisi kolom yang MASIH NULL.
-- Baris/kolom yang sudah diisi admin tidak disentuh. Idempoten.

begin;

update add_ons
   set price_daily = case
         when price_daily is null then round(price_monthly::numeric / 30 * 1)::integer
         else price_daily
       end,
       price_weekly = case
         when price_weekly is null then round(price_monthly::numeric / 30 * 7)::integer
         else price_weekly
       end,
       price_yearly = case
         when price_yearly is null then round(price_monthly::numeric / 30 * 365)::integer
         else price_yearly
       end
 where price_monthly is not null
   and (price_daily is null or price_weekly is null or price_yearly is null);

commit;
