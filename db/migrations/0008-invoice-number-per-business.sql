-- 0008: nomor invoice unik per business, bukan global.
-- number dihitung per-business (count+1) sehingga dua business bisa menghasilkan
-- nomor identik (mis. INV-202608-0001) — constraint unique global menyebabkan
-- insert gagal setelah subscription ter-update (partial state finansial).
-- Idempotent — aman dijalankan berulang / pada baseline schema baru.

alter table invoices drop constraint if exists invoices_number_key;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'invoices_business_number_key'
  ) then
    alter table invoices
      add constraint invoices_business_number_key unique (business_id, number);
  end if;
end $$;
