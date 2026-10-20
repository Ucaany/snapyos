-- 0072 — Label add-on storage memakai MB.
--
-- Produk memakai satuan MB di seluruh UI (StorageIndicator/StorageUsageCard).
-- Seed 0053 menyimpan nama "Tambah Storage 1 GB" padahal storage_mb = 1024;
-- nama itu tampil apa adanya di kartu add-on dan checkout. Perbarui baris seed
-- yang sudah terlanjur dibuat tanpa mengubah kuota (storage_mb tetap 1024).
--
-- Idempotent: hanya menyentuh nama seed yang persis lama.
-- Rollback: 0072_storage_addon_mb_label_rollback.sql.

begin;

update add_ons
   set name = 'Tambah Storage 1.024 MB',
       updated_at = now()
 where code = 'extra_storage'
   and storage_mb = 1024
   and name = 'Tambah Storage 1 GB';

commit;
