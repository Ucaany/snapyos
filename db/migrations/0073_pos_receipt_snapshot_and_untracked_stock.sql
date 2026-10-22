-- 0073 — snapshot setting printer POS + stok NULL tidak ditrack.

begin;

alter table pos_orders
  add column if not exists paper_width_mm integer not null default 80
    check (paper_width_mm in (58, 80));
alter table pos_orders
  add column if not exists print_mode text not null default 'browser'
    check (print_mode in ('browser', 'bluetooth'));
alter table pos_orders
  add column if not exists auto_print boolean not null default true;

create or replace function pos_create_order_with_items(
  p_business uuid,
  p_photobox uuid,
  p_outlet uuid,
  p_cashier uuid,
  p_number text,
  p_gross integer,
  p_discount integer,
  p_final integer,
  p_paper_width integer,
  p_print_mode text,
  p_auto_print boolean,
  p_items jsonb
) returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_order_id uuid;
begin
  insert into pos_orders (
    business_id, photobox_id, outlet_id, cashier_user_id, number, status,
    gross_amount, discount_amount, final_amount, payment_method,
    paper_width_mm, print_mode, auto_print
  ) values (
    p_business, p_photobox, p_outlet, p_cashier, p_number, 'pending',
    p_gross, p_discount, p_final, 'cash',
    p_paper_width, p_print_mode, p_auto_print
  ) returning id into v_order_id;

  insert into pos_order_items (
    pos_order_id, pos_product_id, name_snapshot, sku_snapshot,
    unit_price_snapshot, cost_snapshot, quantity, subtotal
  )
  select
    v_order_id,
    nullif(item->>'pos_product_id', '')::uuid,
    item->>'name_snapshot',
    nullif(item->>'sku_snapshot', ''),
    (item->>'unit_price_snapshot')::integer,
    nullif(item->>'cost_snapshot', '')::integer,
    (item->>'quantity')::integer,
    (item->>'subtotal')::integer
  from jsonb_array_elements(p_items) as item;

  return v_order_id;
end;
$$;

create or replace function pos_set_booth_enabled(
  p_business uuid,
  p_photobox uuid,
  p_enabled boolean
) returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
begin
  perform pg_advisory_xact_lock(hashtext(p_business::text));
  if not exists (
    select 1 from photoboxes where id = p_photobox and business_id = p_business
  ) then
    return false;
  end if;

  if p_enabled then
    update photoboxes
       set pos_enabled = false
     where business_id = p_business
       and id <> p_photobox
       and pos_enabled = true;
  end if;

  update photoboxes
     set pos_enabled = p_enabled
   where id = p_photobox
     and business_id = p_business;
  return found;
end;
$$;

create or replace function pos_decrement_stock(
  p_business uuid,
  p_product uuid,
  p_qty integer
) returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_stock integer;
begin
  if p_qty is null or p_qty <= 0 then
    return true;
  end if;

  select stock into v_stock
    from pos_products
   where id = p_product
     and business_id = p_business;
  if not found then
    return false;
  end if;
  if v_stock is null then
    return true;
  end if;

  update pos_products
     set stock = stock - p_qty, updated_at = now()
   where id = p_product
     and business_id = p_business
     and stock >= p_qty;
  return found;
end;
$$;

revoke execute on function pos_create_order_with_items(uuid, uuid, uuid, uuid, text, integer, integer, integer, integer, text, boolean, jsonb) from public, anon, authenticated;
grant execute on function pos_create_order_with_items(uuid, uuid, uuid, uuid, text, integer, integer, integer, integer, text, boolean, jsonb) to service_role;
revoke execute on function pos_set_booth_enabled(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function pos_set_booth_enabled(uuid, uuid, boolean) to service_role;

commit;
