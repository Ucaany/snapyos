-- 0048_platform_admin_extensions.sql
-- Batch ekstensi admin platform (audit 2026-09-30):
--   1. `templates.price` (integer IDR, nullable) + `templates.is_premium` —
--      template global bisa dijual / dipagari pembelian (per kategori).
--   2. `template_categories.price` (integer IDR, nullable) — harga default
--      per kategori (dipakai template yang tidak men-set price sendiri).
--   3. Feature flag `direct_payment` di seed plans.features jsonb —
--      gate payment gateway direct-merchant per plan (docs/02 §2.7).
--   4. `platform_settings` keys baru: `maintenance_message` (text),
--      `gateway_pakasir_enabled`, `gateway_midtrans_enabled`,
--      `gateway_tripay_enabled` (boolean) — enable/disable provider global.
--
-- Rollback: 0048_platform_admin_extensions_rollback.sql.

-- 1. Template global jualan: harga + flag premium.
alter table templates
  add column if not exists price integer check (price is null or price >= 0);
alter table templates
  add column if not exists is_premium boolean not null default false;

-- 2. Harga default per kategori.
alter table template_categories
  add column if not exists price integer check (price is null or price >= 0);

-- 3. Feature flag direct_payment pada plan seed (idempotent via jsonb merge).
--    Hanya menyisipkan key; tidak menimpa features lain.
update plans
  set features = features || '{"direct_payment": true}'::jsonb
  where code in ('growth', 'business')
    and (features ->> 'direct_payment') is null;

update plans
  set features = features || '{"direct_payment": false}'::jsonb
  where code = 'starter'
    and (features ->> 'direct_payment') is null;

-- 4. Platform settings baru (insert-only; upsert di app layer).
insert into platform_settings (key, value) values
  ('maintenance_message', '"Platform sedang perawatan sistem. Coba lagi beberapa saat."'::jsonb),
  ('gateway_pakasir_enabled', 'true'::jsonb),
  ('gateway_midtrans_enabled', 'true'::jsonb),
  ('gateway_tripay_enabled', 'true'::jsonb)
on conflict (key) do nothing;
