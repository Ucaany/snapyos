-- ---------------------------------------------------------------------------
-- 0084_sweep_legacy_overquota_voucher_payments.sql
--
-- Trigger 0083 hanya menahan payment BARU. Payment yang sudah terlanjur
-- pending sebelum trigger aktif tetap bisa settle walau kuota voucher sudah
-- habis. Script ini:
--   1. menampilkan payment ber-voucher yang sudah melewati kuota (untuk review),
--   2. meng-expire payment pending yang SUDAH kedaluwarsa (aman: tidak ada dana),
--   3. TIDAK menyentuh payment yang sudah paid — itu keputusan bisnis.
--
-- Aman dijalankan berulang. Read-only kecuali langkah 2.
-- ---------------------------------------------------------------------------

-- 1) Daftar payment yang melampaui kuota (review manual).
with usage as (
  select voucher_id, count(*) as used
    from voucher_usages
   group by voucher_id
),
flagged as (
  select p.id,
         p.business_id,
         p.voucher_id,
         p.status,
         p.final_amount,
         p.created_at,
         p.expires_at,
         v.code,
         v.usage_limit,
         coalesce(u.used, 0) as used
    from payments p
    join vouchers v on v.id = p.voucher_id
    left join usage u on u.voucher_id = p.voucher_id
   where v.usage_limit is not null
     and coalesce(u.used, 0) >= v.usage_limit
)
select id, code, status, final_amount, created_at, expires_at
  from flagged
 order by created_at desc;

-- 2) Expire payment pending yang sudah lewat masa bayar (tidak ada dana masuk).
with usage as (
  select voucher_id, count(*) as used
    from voucher_usages
   group by voucher_id
)
update payments p
   set status = 'expired'
  from vouchers v
  left join usage u on u.voucher_id = v.id
 where p.voucher_id = v.id
   and v.usage_limit is not null
   and coalesce(u.used, 0) >= v.usage_limit
   and p.status = 'pending'
   and p.expires_at is not null
   and p.expires_at < now();

-- Catatan: payment 'paid' yang melampaui kuota sengaja dibiarkan. Dana sudah
-- diterima; menandainya expired akan membuat laporan keuangan tidak cocok.
-- Selesaikan lewat rekonsiliasi bisnis (tagih selisih diskon atau beri kredit).
