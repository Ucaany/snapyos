-- 0019_pos_addon.sql — POS add-on v2 offline-only, per-booth (docs/pos/02).
-- Additive-only. Reversible (lihat rollback di db/migrations/0019_pos_addon_rollback.sql).
-- TIDAK menyentuh payments / business_members / NOT NULL existing.

begin;

-- ============================================================================
-- 1. Tabel POS
-- ============================================================================

create table pos_products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  name text not null,
  sku text,
  category text not null default 'lainnya',
  description text,
  price integer not null check (price > 0),
  cost integer check (cost is null or cost >= 0),
  stock integer check (stock is null or stock >= 0),  -- NULL = tidak ditrack
  is_active boolean not null default true,
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pos_products_business_sku_key unique (business_id, sku)
);
create index idx_pos_products_business on pos_products (business_id, is_active);
create trigger trg_pos_products_updated_at before update on pos_products
  for each row execute function set_updated_at();

create table pos_orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  photobox_id uuid not null references photoboxes (id) on delete restrict,  -- per-booth (A13)
  outlet_id uuid references outlets (id) on delete set null,                -- diisi dari photobox.outlet_id
  cashier_user_id uuid not null references users (id) on delete restrict,   -- staff/manager/owner yang menjual
  customer_id uuid references customers (id) on delete set null,
  number text not null,                                                     -- POS-YYYYMMDD-#### zona Asia/Jakarta (A14)
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'cancelled')),                     -- TANPA 'expired' (A15)
  gross_amount integer not null check (gross_amount >= 0),
  discount_amount integer not null default 0 check (discount_amount >= 0),
  final_amount integer not null check (final_amount >= 0),
  payment_method text not null default 'cash'
    check (payment_method in ('cash', 'bank_transfer', 'other')),           -- offline-only (A2)
  payment_reference text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pos_orders_business_number_key unique (business_id, number),
  constraint pos_orders_amounts_valid check (final_amount = gross_amount - discount_amount)
);
create index idx_pos_orders_business_status on pos_orders (business_id, status);
create index idx_pos_orders_business_paid on pos_orders (business_id, paid_at) where status = 'paid';
create index idx_pos_orders_cashier on pos_orders (business_id, cashier_user_id);
create index idx_pos_orders_photobox on pos_orders (photobox_id);
create trigger trg_pos_orders_updated_at before update on pos_orders
  for each row execute function set_updated_at();

create table pos_order_items (
  id uuid primary key default gen_random_uuid(),
  pos_order_id uuid not null references pos_orders (id) on delete cascade,
  pos_product_id uuid references pos_products (id) on delete set null,
  name_snapshot text not null,
  sku_snapshot text,
  unit_price_snapshot integer not null check (unit_price_snapshot >= 0),
  cost_snapshot integer check (cost_snapshot is null or cost_snapshot >= 0),
  quantity integer not null check (quantity > 0),
  subtotal integer not null check (subtotal >= 0),
  created_at timestamptz not null default now()
);
create index idx_pos_order_items_order on pos_order_items (pos_order_id);
create index idx_pos_order_items_product on pos_order_items (pos_product_id);

-- Decrement stok guarded (atomic, race-safe) — dipanggil RPC dari app saat order paid.
-- false = stok kurang / produk tak ditemukan (shortfall → audit, order tetap paid).
create or replace function pos_decrement_stock(
  p_business uuid,
  p_product uuid,
  p_qty integer
) returns boolean
language plpgsql
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

-- ============================================================================
-- 2. Toggle POS per booth (A13)
-- ============================================================================

alter table photoboxes add column pos_enabled boolean not null default false;

-- ============================================================================
-- 3. Kolom additive di transactions (traceability POS ↔ reporting)
--    TIDAK ada relax NOT NULL: outlet_id & photobox_id selalu terisi dari booth
--    (photoboxes.outlet_id NOT NULL — schema.sql:209).
-- ============================================================================

alter table transactions add column pos_order_id uuid references pos_orders (id) on delete set null;
alter table transactions add column cashier_user_id uuid references users (id) on delete set null;
create index idx_tx_pos_order on transactions (pos_order_id);

-- ============================================================================
-- 4. Seed add-on POS (harga default platform; admin bebas ubah via /admin/add-ons)
-- ============================================================================

insert into add_ons (code, name, price_monthly, unit, is_active)
values ('pos', 'POS Kasir', 99000, 'feature', true)
on conflict (code) do nothing;

commit;
