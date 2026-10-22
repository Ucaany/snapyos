-- Rollback: kembalikan ON DELETE RESTRICT → ON DELETE SET NULL.
begin;

alter table sessions
  drop constraint if exists sessions_customer_id_fkey;
alter table sessions
  add constraint sessions_customer_id_fkey
  foreign key (customer_id) references customers (id) on delete set null;

alter table transactions
  drop constraint if exists transactions_customer_id_fkey;
alter table transactions
  add constraint transactions_customer_id_fkey
  foreign key (customer_id) references customers (id) on delete set null;

alter table pos_orders
  drop constraint if exists pos_orders_customer_id_fkey;
alter table pos_orders
  add constraint pos_orders_customer_id_fkey
  foreign key (customer_id) references customers (id) on delete set null;

alter table voucher_usages
  drop constraint if exists voucher_usages_customer_id_fkey;
alter table voucher_usages
  add constraint voucher_usages_customer_id_fkey
  foreign key (customer_id) references customers (id) on delete set null;

commit;
