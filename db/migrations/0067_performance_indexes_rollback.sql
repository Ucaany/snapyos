-- Rollback 0067 — hapus index performance. pg_trgm TIDAK dilepas (mungkin
-- dipakai objek lain; aman dibiarkan terpasang).
--
-- Non-destruktif: hanya menghapus index, tidak menyentuh data.

begin;

drop index if exists idx_sessions_customer;
drop index if exists idx_tx_created_at;
drop index if exists idx_tx_paid_at;
drop index if exists idx_customers_name_trgm;
drop index if exists idx_audit_action_trgm;
drop index if exists idx_pos_products_name_trgm;
drop index if exists idx_pos_orders_business_created;

commit;
