-- APPLY_0072_0075_0076_combined.sql
--
-- Terapkan tiga migrasi yang terukur BELUM ada di cloud (probe 2026-10-27):
--   0072_storage_addon_mb_label.sql      — label add-on storage MB (DML)
--   0075_integrity_and_hot_indexes.sql   — FK photoboxes.default_template_id + 3 index
--   0076_pos_stock_batch.sql             — RPC pos_decrement_stock_batch (P0, blokir POS)
--
-- Cara pakai:
--   a) Supabase SQL Editor: tempel seluruh berkas, Run.
--   b) psql:  psql "$SUPABASE_DB_URL" -f db/migrations/APPLY_0072_0075_0076_combined.sql
--   c) CLI :  supabase db query --linked --project-ref <ref> -f db/migrations/APPLY_0072_0075_0076_combined.sql
--
-- Sifat: idempotent (aman diulang). Tiap blok dibungkus transaksi sendiri supaya
-- kegagalan satu blok tidak membatalkan blok lain yang sudah sukses, dan pesan
-- galatnya menunjuk migrasi yang bermasalah.
--
-- Prasyarat terverifikasi 2026-10-27 sebelum berkas ini dibuat:
--   - 0 baris photoboxes.default_template_id yatim  (aman untuk FK 0075)
--   - 0 pos_order_id duplikat di transactions       (aman untuk 0076)
--
-- Rollback tersedia di berkas *_rollback.sql masing-masing migrasi.

-- ===========================================================================
-- 0072 — Label add-on storage memakai MB
-- ===========================================================================
begin;
update add_ons
   set name = 'Tambah Storage 1.024 MB',
       updated_at = now()
 where code = 'extra_storage'
   and storage_mb = 1024
   and name = 'Tambah Storage 1 GB';
commit;

-- ===========================================================================
-- 0075 — Integritas referensi + index jalur panas
-- ===========================================================================
begin;
-- Guard: hanya tambah FK bila belum ada (0075 asli tidak IF NOT EXISTS).
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'photoboxes_default_template_id_fkey'
       and conrelid = 'public.photoboxes'::regclass
  ) then
    alter table photoboxes
      add constraint photoboxes_default_template_id_fkey
      foreign key (default_template_id) references templates (id) on delete set null;
  end if;
end $$;

create index if not exists idx_photoboxes_default_template
  on photoboxes (default_template_id)
  where default_template_id is not null;

create index if not exists idx_payments_credential
  on payments (credential_id)
  where credential_id is not null;

create index if not exists idx_payments_pending_expiry
  on payments (expires_at)
  where status = 'pending';
commit;

-- ===========================================================================
-- 0076 — Decrement stok POS secara batch (P0: blokir checkout POS)
-- ===========================================================================
begin;
create or replace function pos_decrement_stock_batch(
  p_business uuid,
  p_items jsonb
) returns table (product_id uuid, ok boolean)
language plpgsql
set search_path = public, pg_temp
as $$
begin
  return query
  with req as (
    select (i->>'product_id')::uuid as id,
           sum((i->>'qty')::integer)::integer as qty
      from jsonb_array_elements(p_items) as i
     where coalesce((i->>'qty')::integer, 0) > 0
     group by 1
  ),
  upd as (
    update pos_products p
       set stock = p.stock - req.qty,
           updated_at = now()
      from req
     where p.id = req.id
       and p.business_id = p_business
       and p.stock is not null
       and p.stock >= req.qty
    returning p.id
  )
  select req.id,
         exists (select 1 from upd u where u.id = req.id)
         or exists (
           select 1 from pos_products p2
            where p2.id = req.id
              and p2.business_id = p_business
              and p2.stock is null
         )
    from req;
end;
$$;

revoke execute on function pos_decrement_stock_batch(uuid, jsonb) from public, anon, authenticated;
grant execute on function pos_decrement_stock_batch(uuid, jsonb) to service_role;
commit;
