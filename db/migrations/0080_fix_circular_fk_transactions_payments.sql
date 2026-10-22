-- 0080: fix circular FK transactions ↔ payments.
--
-- Bug #2: dua FK membentuk siklus:
--   payments.transaction_id  → transactions(id) ON DELETE SET NULL
--   transactions.payment_id  → payments(id)     ON DELETE SET NULL
--
-- Circular FK mencegah pg_dump --serializable-deferrable, mempersulit
-- DELETE, dan membuat CASCADE tidak deterministik.
--
-- Strategi: hapus FK di sisi transactions.payment_id. Kolom tetap ada
-- (dipakai settle RPC & unique index uq_transaction_payment), tetapi
-- integritas referensial dijaga di level aplikasi (settle RPC selalu
-- INSERT transaction + UPDATE payment dalam satu transaksi).
--
-- payments.transaction_id FK tetap ada — arah ini paling penting
-- untuk ON DELETE SET NULL saat transaction dihapus (admin cleanup).

begin;

-- Cari nama constraint; Postgres auto-name: transactions_payment_id_fkey.
alter table transactions
  drop constraint if exists transactions_payment_id_fkey;

commit;
