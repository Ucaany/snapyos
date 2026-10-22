-- 0079: fix ON DELETE SET NULL → ON DELETE RESTRICT pada FK ke customers.
--
-- Bug #5: customer yang dihapus menyebabkan data historis kehilangan
-- referensi (customer_id jadi NULL). Bisnis seharusnya tidak bisa
-- menghapus customer yang masih punya data terkait.
--
-- Tabel yang terdampak:
--   sessions.customer_id       — named constraint sessions_customer_id_fkey
--   transactions.customer_id   — named constraint transactions_customer_id_fkey
--   pos_orders.customer_id     — inline FK (auto-named pos_orders_customer_id_fkey)
--   voucher_usages.customer_id — inline FK (auto-named voucher_usages_customer_id_fkey)

begin;

-- 1. sessions
alter table sessions
  drop constraint if exists sessions_customer_id_fkey;
alter table sessions
  add constraint sessions_customer_id_fkey
  foreign key (customer_id) references customers (id) on delete restrict;

-- 2. transactions
alter table transactions
  drop constraint if exists transactions_customer_id_fkey;
alter table transactions
  add constraint transactions_customer_id_fkey
  foreign key (customer_id) references customers (id) on delete restrict;

-- 3. pos_orders
alter table pos_orders
  drop constraint if exists pos_orders_customer_id_fkey;
alter table pos_orders
  add constraint pos_orders_customer_id_fkey
  foreign key (customer_id) references customers (id) on delete restrict;

-- 4. voucher_usages
alter table voucher_usages
  drop constraint if exists voucher_usages_customer_id_fkey;
alter table voucher_usages
  add constraint voucher_usages_customer_id_fkey
  foreign key (customer_id) references customers (id) on delete restrict;

commit;
