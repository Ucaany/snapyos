-- 0048_platform_admin_extensions_rollback.sql

alter table templates drop column if exists price;
alter table templates drop column if exists is_premium;
alter table template_categories drop column if exists price;

-- Feature flag: set ke false (tidak menghapus key, aman untuk rollback parsial).
update plans set features = features - 'direct_payment';

delete from platform_settings where key in (
  'maintenance_message',
  'gateway_pakasir_enabled',
  'gateway_midtrans_enabled',
  'gateway_tripay_enabled'
);
