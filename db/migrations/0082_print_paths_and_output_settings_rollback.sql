begin;

alter table pos_orders drop constraint if exists pos_orders_print_mode_check;
alter table pos_orders
  add constraint pos_orders_print_mode_check
  check (print_mode in ('browser', 'bluetooth'));

alter table business_settings
  drop column if exists output;

commit;
