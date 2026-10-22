begin;

drop function if exists pos_create_order_with_items(uuid, uuid, uuid, uuid, text, integer, integer, integer, integer, text, boolean, jsonb);
drop function if exists pos_set_booth_enabled(uuid, uuid, boolean);

alter table pos_orders
  drop column if exists paper_width_mm,
  drop column if exists print_mode,
  drop column if exists auto_print;

create or replace function pos_decrement_stock(
  p_business uuid,
  p_product uuid,
  p_qty integer
) returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if p_qty is null or p_qty <= 0 then
    return true;
  end if;
  update pos_products
     set stock = stock - p_qty, updated_at = now()
   where id = p_product
     and business_id = p_business
     and stock is not null
     and stock >= p_qty;
  return found;
end;
$$;

commit;
