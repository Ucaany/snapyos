-- 0053 — Profil bisnis (whatsapp/owner/kontak/alamat) + storage add-on.
--
-- (1) Kolom profil bisnis direktori pada `businesses` — diedit owner di
--     /dashboard/settings (Profil Bisnis), tampil read-only di admin.
--     Validasi format di app layer (docs/08 §8.19), konsisten dgn users.whatsapp.
-- (2) `add_ons.storage_mb` — add-on ber-unit MB menambah kuota storage
--     efektif (plan.storage_limit_mb + sum add-on aktif ber-storage_mb).
--     Seed `extra_storage` 1 GB agar owner bisa upgrade saat penyimpanan penuh.

alter table businesses
  add column if not exists whatsapp text,
  add column if not exists owner_name text,
  add column if not exists contact_email text,
  add column if not exists address text;

alter table add_ons
  add column if not exists storage_mb integer
    check (storage_mb is null or storage_mb > 0);

insert into add_ons (code, name, price_monthly, unit, is_active, storage_mb)
values ('extra_storage', 'Tambah Storage 1 GB', 49000, 'storage', true, 1024)
on conflict (code) do nothing;