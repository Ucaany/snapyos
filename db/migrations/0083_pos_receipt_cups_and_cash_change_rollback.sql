begin;

alter table pos_orders drop constraint if exists pos_orders_cash_change_valid;
alter table pos_orders drop column if exists change_amount;
alter table pos_orders drop column if exists amount_received;

alter table pos_orders drop constraint if exists pos_orders_print_mode_check;
alter table pos_orders
  add constraint pos_orders_print_mode_check
  check (print_mode in ('browser', 'bluetooth'));

commit;
