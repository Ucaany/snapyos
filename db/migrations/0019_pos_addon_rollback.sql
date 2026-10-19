-- 0019_pos_addon_rollback.sql — balikkan 0019_pos_addon.sql (docs/pos/02 §10).
-- Simpan berdampingan, JANGAN dijalankan otomatis.
-- Tanpa kondisi data: semua kolom/tabel murni additive → rollback selalu aman.

begin;

alter table transactions drop column if exists cashier_user_id;
alter table transactions drop column if exists pos_order_id;
alter table photoboxes drop column if exists pos_enabled;
drop function if exists pos_decrement_stock(uuid, uuid, integer);
drop table if exists pos_order_items;
drop table if exists pos_orders;
drop table if exists pos_products;
delete from add_ons where code = 'pos';  -- opsional; cukup is_active=false utk matikan fitur

commit;
