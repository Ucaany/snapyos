-- 0039_template_categories_fk.sql
-- Audit 2026-09-16: `templates.category` sebelumnya adalah CHECK enum fixed
-- (9 nilai). Sementara `template_categories` bisa berisi kategori bebas yang
-- dibuat admin di /admin/templates. Akibatnya, kategori baru admin TIDAK
-- pernah bisa dipakai template baru. Migrasi ini menghubungkan keduanya.
--
-- Perubahan:
--   1. Seed 9 kategori default ke `template_categories` (idempotent).
--   2. Tambah kolom `templates.category_id uuid REFERENCES template_categories(id)`.
--   3. Backfill `category_id` dari `category` text.
--   4. Drop CHECK constraint pada `templates.category` — text field tetap ada
--      sebagai display fallback selama transisi (deprecated); admin baru dan
--      seluruh query admin memakai `category_id`. Owner UI existing tetap
--      berjalan dengan `category` text bebas.
--
-- Rollback: 0039_template_categories_fk_rollback.sql.

-- 1. Seed 9 kategori default (idempotent via ON CONFLICT).
insert into template_categories (name, is_global) values
  ('minimal', true),
  ('cute', true),
  ('retro', true),
  ('y2k', true),
  ('wedding', true),
  ('birthday', true),
  ('graduation', true),
  ('event', true),
  ('custom', true)
on conflict (name) do nothing;

-- 2. Tambah kolom category_id (nullable — akan di-set NOT NULL setelah backfill).
alter table templates
  add column if not exists category_id uuid references template_categories (id) on delete restrict;

-- 3. Backfill dari `category` text ke `category_id`.
update templates t
  set category_id = tc.id
  from template_categories tc
  where t.category_id is null
    and lower(t.category) = lower(tc.name);

-- Fallback untuk template dengan kategori orphan (tak match): map ke 'custom'.
update templates t
  set category_id = (select id from template_categories where name = 'custom' limit 1)
  where t.category_id is null;

-- 4. Drop CHECK constraint pada `category` text agar kategori baru admin
--    (di FK) tidak crash bila text field tetap dipakai owner sebagai bebas.
--    Note: PostgreSQL name convention `<table>_<column>_check` untuk anonymous
--    CHECK constraint. Cari secara aman.
do $$
declare
  cname text;
begin
  select conname into cname
  from pg_constraint
  where conrelid = 'templates'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%category%in%(%minimal%';
  if cname is not null then
    execute format('alter table templates drop constraint %I', cname);
  end if;
end$$;

-- 5. Index untuk lookup by category_id.
create index if not exists idx_templates_category_id on templates (category_id, is_active);
