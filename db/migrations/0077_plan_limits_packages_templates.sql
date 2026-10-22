-- 0077: tambah max_packages & max_templates ke tabel plans.
--
-- Bug #7 & #9: plan system tidak membatasi jumlah packages dan templates
-- yang bisa dibuat per-business. Kolom baru mengikuti pola existing
-- (max_outlets, max_staff, dsb). Default konservatif: 50 package, 20 template.

begin;

alter table plans
  add column if not exists max_packages integer not null default 50,
  add column if not exists max_templates integer not null default 20;

commit;
