-- Rollback: pulihkan FK transactions.payment_id → payments(id).
begin;

-- Hanya tambahkan FK jika belum ada (idempotent).
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
     where constraint_name = 'transactions_payment_id_fkey'
       and table_name = 'transactions'
  ) then
    alter table transactions
      add constraint transactions_payment_id_fkey
      foreign key (payment_id) references payments (id) on delete set null;
  end if;
end $$;

commit;
