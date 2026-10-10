-- 0067 — Performance indexes (audit 2026-10-09).
--
-- Menambahkan index yang hilang untuk query terpanas: customer-session lookup,
-- rentang global tx created_at/paid_at, pencarian teks (trigram) nama customer /
-- audit action / nama produk POS, dan list POS per business.
--
-- Idempotent: `create index if not exists` + `create extension if not exists`.
-- pg_trgm = extension standar Postgres (bukan third-party) untuk GIN trigram.

begin;

create extension if not exists pg_trgm;

-- 5A. Customer-session & rentang waktu transaksi.
create index if not exists idx_sessions_customer on sessions (business_id, customer_id);
create index if not exists idx_tx_created_at on transactions (created_at);
create index if not exists idx_tx_paid_at on transactions (paid_at) where status = 'paid';

-- 5B. Pencarian teks (ilike/%term%) — trigram GIN mempercepat substring match.
create index if not exists idx_customers_name_trgm on customers using gin (name gin_trgm_ops);
create index if not exists idx_audit_action_trgm on audit_logs using gin (action gin_trgm_ops);
create index if not exists idx_pos_products_name_trgm on pos_products using gin (name gin_trgm_ops);

-- 5C. POS orders per business diurutkan waktu.
create index if not exists idx_pos_orders_business_created on pos_orders (business_id, created_at);

commit;
