-- 0076: decrement stok POS secara batch.
--
-- pos_decrement_stock dipanggil satu kali per item: order 10 baris = 10
-- round-trip RPC ke database pada jalur checkout. Batch memakai satu UPDATE
-- dari jsonb, dengan aturan yang sama: stok null = tidak dilacak (selalu ok),
-- stok kurang = tidak diubah dan dilaporkan ok=false.

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
