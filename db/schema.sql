-- ============================================================================
-- SnapyOS — Database schema (PostgreSQL / Supabase)
-- Source of truth: docs/07-database-schema.md
-- Konvensi: PK uuid (gen_random_uuid()), uang integer IDR, timestamptz,
--           entity bisnis selalu scoped `business_id`.
-- ============================================================================

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- Trigger: updated_at otomatis
-- ---------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ============================================================================
-- 7.1 Global / Auth
-- ============================================================================

create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  email_verified timestamptz,
  password_hash text,
  name text,
  avatar_url text,
  role text not null default 'user' check (role in ('user', 'admin')),
  status text not null default 'active' check (status in ('active', 'suspended')),
  -- Profil registrasi (0017): divalidasi app layer, read-only admin.
  whatsapp text,
  acquisition_source text,
  planned_devices integer check (planned_devices is null or planned_devices >= 0),
  signup_ip text,
  signup_user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_users_updated_at before update on users
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Auth.js session revocation (JWT transport + baris sesi DB — docs/09 §10).
-- Di schema public agar terekspos PostgREST tanpa setting "Exposed schemas".
-- RLS aktif tanpa policy → hanya service_role (bypass RLS) yang bisa akses.
-- ---------------------------------------------------------------------------
create table if not exists auth_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  session_token text not null unique,
  expires timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_auth_sessions_user on auth_sessions (user_id);

alter table auth_sessions enable row level security;

-- ============================================================================
-- 7.2 Tenant & Subscription
-- ============================================================================

create table businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references users (id) on delete restrict,
  slug text not null unique,
  name text not null,
  logo_url text,
  whatsapp text,          -- profil bisnis (0053): nomor WhatsApp owner/bisnis
  owner_name text,        -- nama pemilik owner (0053), diisi saat onboarding/update
  contact_email text,     -- email kontak bisnis (0053)
  address text,           -- alamat bisnis (0053)
  timezone text not null default 'Asia/Jakarta',
  currency text not null default 'IDR',
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_businesses_updated_at before update on businesses
  for each row execute function set_updated_at();

create table business_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  role text not null default 'staff' check (role in ('owner', 'manager', 'staff')),
  created_at timestamptz not null default now(),
  unique (business_id, user_id)
);
create index idx_bm_user on business_members (user_id);
create index idx_bm_business_role on business_members (business_id, role);

create table business_settings (
  business_id uuid primary key references businesses (id) on delete cascade,
  branding jsonb,
  camera jsonb,
  checkout jsonb,
  retention_days integer not null default 3,   -- keputusan #4: retensi max 3 hari (0035)
  updated_at timestamptz not null default now()
);
create trigger trg_business_settings_updated_at before update on business_settings
  for each row execute function set_updated_at();

create table plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  price_monthly integer not null check (price_monthly >= 0),
  price_yearly integer check (price_yearly >= 0),
  billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly', 'yearly')),
  max_businesses integer not null default 1,
  max_outlets integer not null default 1,
  max_photoboxes integer not null default 1,
  max_concurrent_sessions integer not null default 1,
  max_staff integer not null default 1,
  storage_limit_mb integer not null default 1024,
  platform_fee_percent numeric not null default 0,
  platform_fee_flat integer not null default 0,
  features jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_plans_updated_at before update on plans
  for each row execute function set_updated_at();

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  plan_id uuid not null references plans (id) on delete restrict,
  status text not null default 'trial'
    check (status in ('trial', 'active', 'past_due', 'cancelled', 'expired')),
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_sub_business_status on subscriptions (business_id, status);
create trigger trg_subscriptions_updated_at before update on subscriptions
  for each row execute function set_updated_at();

create table invoices (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  subscription_id uuid references subscriptions (id) on delete set null,
  number text not null,
  amount integer not null check (amount >= 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'void')),
  paid_at timestamptz,
  -- Intent pembayaran-first (0012): plan_change/add_on diaktifkan saat paid.
  intent jsonb,
  created_at timestamptz not null default now(),
  -- Unik per business (0008) — seq dihitung per-business.
  constraint invoices_business_number_key unique (business_id, number)
);
create index idx_inv_business on invoices (business_id, status);

create table add_ons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  price_monthly integer not null check (price_monthly >= 0),
  unit text not null default 'session',
  storage_mb integer check (storage_mb is null or storage_mb > 0),  -- add-on storage (0053)
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_add_ons_updated_at before update on add_ons
  for each row execute function set_updated_at();

create table subscription_add_ons (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references subscriptions (id) on delete cascade,
  add_on_id uuid not null references add_ons (id) on delete restrict,
  quantity integer not null default 1 check (quantity > 0),
  status text not null default 'active' check (status in ('active', 'cancelled')),
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subscription_id, add_on_id)
);
create trigger trg_subscription_add_ons_updated_at before update on subscription_add_ons
  for each row execute function set_updated_at();

-- ============================================================================
-- 7.3 Operational
-- ============================================================================

create table outlets (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  name text not null,
  address text,
  city text,
  province text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_outlets_business on outlets (business_id, status);
create trigger trg_outlets_updated_at before update on outlets
  for each row execute function set_updated_at();

create table photoboxes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  outlet_id uuid not null references outlets (id) on delete cascade,
  slug text not null,
  name text not null,
  status text not null default 'offline' check (status in ('online', 'offline', 'maintenance')),
  camera text,
  printer text,
  display text,
  default_template_id uuid,
  camera_settings jsonb,
  print_settings jsonb,
  session_settings jsonb,
  device_status jsonb,
  exit_pin_hash text,                          -- argon2id (0034); sha256 legacy → owner set ulang
  exit_pin_failed_count integer not null default 0,  -- throttle brute-force (0034)
  exit_pin_locked_until timestamptz,                 -- 5 gagal → lock 5 menit (0034)
  pos_enabled boolean not null default false,  -- POS add-on per booth (0019)
  branding jsonb,                              -- per-booth branding override (0045); null = inherit business
  payment_mode text check (payment_mode in ('gateway', 'voucher')),  -- per-booth channel (0055); null = gateway + voucher
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, slug)
);
create index idx_photoboxes_business on photoboxes (business_id, status);
create index idx_photoboxes_outlet on photoboxes (business_id, outlet_id);
create unique index idx_photoboxes_one_pos_active on photoboxes (business_id) where pos_enabled = true;  -- POS: 1 booth aktif per business (0056)
create trigger trg_photoboxes_updated_at before update on photoboxes
  for each row execute function set_updated_at();

-- Akses photobox per member (owner mengatur booth yang bisa diakses staff) — 0018.
create table member_photoboxes (
  user_id uuid not null references users (id) on delete cascade,
  business_id uuid not null references businesses (id) on delete cascade,
  photobox_id uuid not null references photoboxes (id) on delete cascade,
  pin_hash text,                              -- argon2id PIN login staff (0043); null = tanpa PIN
  created_at timestamptz not null default now(),
  primary key (user_id, photobox_id)
);
create index idx_member_photoboxes_business on member_photoboxes (business_id);

create table devices (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  photobox_id uuid not null references photoboxes (id) on delete cascade,
  name text,
  device_token_hash text not null,
  status text not null default 'active' check (status in ('active', 'revoked')),
  last_seen_at timestamptz,
  -- Electron kiosk config (0027)
  app_version text,
  os_info jsonb,
  display_orientation text default 'portrait'
    check (display_orientation in ('portrait', 'landscape')),
  display_style text default 'classic'
    check (display_style in ('classic', 'compact', 'receipt')),
  camera_config jsonb not null default '{}'::jsonb,
  printer_config jsonb not null default '{}'::jsonb,
  kiosk_locked boolean not null default false,
  last_heartbeat_at timestamptz,
  diagnostics jsonb not null default '{}'::jsonb,
  operator_user_id uuid references users (id) on delete set null,
  operator_connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_devices_business on devices (business_id, status);
create index idx_devices_photobox on devices (photobox_id);
create index idx_devices_token_hash on devices (device_token_hash);
create trigger trg_devices_updated_at before update on devices
  for each row execute function set_updated_at();

create table activation_codes (
  id uuid primary key default gen_random_uuid(),
  photobox_id uuid not null references photoboxes (id) on delete cascade,
  business_id uuid not null references businesses (id) on delete cascade,
  code text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_activation_codes_photobox on activation_codes (photobox_id, code);

create or replace function activate_device_atomically(
  p_code text,
  p_device_token_hash text
) returns table (device_id uuid, photobox_id uuid, reason text)
language plpgsql
as $$
declare
  v_code activation_codes%rowtype;
begin
  select * into v_code
    from activation_codes
   where code = p_code
   order by created_at desc
   limit 1
   for update;

  if not found then
    return query select null::uuid, null::uuid, 'NOT_FOUND'::text;
    return;
  end if;
  if v_code.used_at is not null then
    return query select null::uuid, v_code.photobox_id, 'USED'::text;
    return;
  end if;
  if v_code.expires_at <= now() then
    return query select null::uuid, v_code.photobox_id, 'EXPIRED'::text;
    return;
  end if;

  delete from devices where devices.photobox_id = v_code.photobox_id;

  return query
    with inserted as (
      insert into devices (business_id, photobox_id, name, device_token_hash, status, last_seen_at)
      values (v_code.business_id, v_code.photobox_id, 'Kiosk', p_device_token_hash, 'active', now())
      returning id
    ), consumed as (
      update activation_codes set used_at = now() where id = v_code.id
    )
    select inserted.id, v_code.photobox_id, 'OK'::text from inserted;
end;
$$;

revoke execute on function activate_device_atomically(text, text) from public, anon, authenticated;
grant execute on function activate_device_atomically(text, text) to service_role;

create table packages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  name text not null,
  price integer not null check (price >= 0),
  photo_count integer not null default 1 check (photo_count >= 1),
  print_count integer not null default 0 check (print_count >= 0),
  digital_output boolean not null default false,
  capture_mode text not null default 'single' check (capture_mode in ('single', 'burst', 'photostrip')),
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_packages_business on packages (business_id, is_active);
create trigger trg_packages_updated_at before update on packages
  for each row execute function set_updated_at();

create table template_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_global boolean not null default false,
  price integer check (price is null or price >= 0)
);

-- Seed 9 kategori default (migration 0039). Idempotent via ON CONFLICT.
insert into template_categories (name, is_global) values
  ('minimal', true), ('cute', true), ('retro', true), ('y2k', true),
  ('wedding', true), ('birthday', true), ('graduation', true),
  ('event', true), ('custom', true)
on conflict (name) do nothing;

create table templates (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses (id) on delete cascade,
  name text not null,
  -- `category` text: display fallback (deprecated), bebas nilai setelah 0039.
  category text not null default 'custom',
  -- `category_id`: FK canonical ke template_categories (migration 0039).
  category_id uuid references template_categories (id) on delete restrict,
  file_url text not null,
  thumbnail_url text,
  video_url text,
  price integer check (price is null or price >= 0),
  is_premium boolean not null default false,
  layout jsonb not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_templates_business on templates (business_id, is_active);
create index idx_templates_category on templates (category);
create index idx_templates_category_id on templates (category_id, is_active);
create trigger trg_templates_updated_at before update on templates
  for each row execute function set_updated_at();

create table stickers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  name text not null,
  category text not null default 'text'
    check (category in ('hearts', 'stars', 'sparkles', 'emoji', 'doodles', 'event', 'text')),
  file_url text not null,
  is_active boolean not null default true
);
create index idx_stickers_business on stickers (business_id, is_active);

create table package_templates (
  package_id uuid not null references packages (id) on delete cascade,
  template_id uuid not null references templates (id) on delete cascade,
  primary key (package_id, template_id)
);

create table package_outlets (
  package_id uuid not null references packages (id) on delete cascade,
  outlet_id uuid not null references outlets (id) on delete cascade,
  primary key (package_id, outlet_id)
);

create table package_photoboxes (
  package_id uuid not null references packages (id) on delete cascade,
  photobox_id uuid not null references photoboxes (id) on delete cascade,
  primary key (package_id, photobox_id)
);

create table business_template_purchases (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  template_id uuid not null references templates (id) on delete cascade,
  invoice_id uuid references invoices (id) on delete set null,
  price integer not null check (price >= 0),
  purchased_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (business_id, template_id)
);
create index idx_btp_business on business_template_purchases (business_id, created_at);
create index idx_btp_template on business_template_purchases (template_id);

-- ============================================================================
-- 7.4 Session & Photo
-- ============================================================================

create table sessions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  outlet_id uuid not null references outlets (id) on delete cascade,
  photobox_id uuid not null references photoboxes (id) on delete cascade,
  event_id uuid,
  package_id uuid not null references packages (id) on delete restrict,
  customer_id uuid,
  status text not null default 'active'
    check (status in ('active', 'completed', 'cancelled', 'expired')),
  retake_count integer not null default 0 check (retake_count >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz,
  finalized_at timestamptz,
  result_gif_key text,
  -- Marker retention cron (0009) — null = media hasil belum dibersihkan.
  media_cleaned_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_sessions_business_status on sessions (business_id, status);
create index idx_sessions_media_pending
  on sessions (business_id, finalized_at)
  where media_cleaned_at is null and status in ('completed', 'expired');
-- Kapasitas business (plan max_concurrent_sessions) — paralel dg 0004-session-capacity.sql.
create index idx_sessions_business_active on sessions (business_id, status, expires_at);
create index idx_sessions_photobox on sessions (photobox_id, status);
create index idx_sessions_expires on sessions (expires_at) where status = 'active';
-- Limit diperketat: 1 sesi AKTIF per photobox (atomik, anti TOCTOU race antar booth).
create unique index uq_sessions_active_per_photobox on sessions (photobox_id) where status = 'active';

create table photos (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions (id) on delete cascade,
  business_id uuid not null references businesses (id) on delete cascade,
  template_id uuid references templates (id) on delete set null,
  file_key text not null,
  thumbnail_key text,
  order_index integer not null default 0,
  created_at timestamptz not null default now()
);
create index idx_photos_session on photos (session_id, order_index);
create index idx_photos_business on photos (business_id);
create index idx_photos_business_created on photos (business_id, created_at);

-- ============================================================================
-- 7.5 Transaction & Payment
-- ============================================================================

-- POS add-on (0019) — offline-only kasir per booth; transaksi POS masuk
-- `transactions` dengan pos_order_id + cashier_user_id (docs/pos).
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
  paper_width_mm integer not null default 80 check (paper_width_mm in (58, 80)),
  print_mode text not null default 'browser'
    check (print_mode in ('browser', 'bluetooth')),
  auto_print boolean not null default true,
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

-- Atomic order + item creation: prevents orphan pending orders when item insert fails.
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

-- Atomic booth switch: one POS booth per business, serialized per tenant.
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

-- Atomic POS payment (0026): conditional UPDATE pos_orders + INSERT transactions
-- in one DB transaction. Returns new transaction id or NULL (not pending / already exists).
create or replace function pos_complete_payment(
  p_order_id uuid,
  p_business uuid,
  p_method text,
  p_cashier uuid,
  p_tx_number text,
  p_outlet_id uuid,
  p_photobox_id uuid,
  p_gross integer,
  p_discount integer,
  p_final integer
) returns uuid
language plpgsql
as $$
declare
  v_tx_id uuid;
  v_existing uuid;
begin
  select id into v_existing
    from transactions
   where pos_order_id = p_order_id
   limit 1;
  if v_existing is not null then
    return null;
  end if;

  update pos_orders
     set status = 'paid',
         paid_at = now(),
         payment_method = p_method
   where id = p_order_id
     and business_id = p_business
     and status = 'pending';

  if not found then
    return null;
  end if;

  insert into transactions (
    business_id, outlet_id, photobox_id, session_id, package_id,
    payment_method, gross_amount, discount_amount, final_amount,
    status, number, pos_order_id, cashier_user_id, paid_at, withdrawable
  ) values (
    p_business, p_outlet_id, p_photobox_id, null, null,
    p_method, p_gross, p_discount, p_final,
    'paid', p_tx_number, p_order_id, p_cashier, now(), false
  )
  returning id into v_tx_id;

  return v_tx_id;
end;
$$;

-- Decrement stok guarded (atomic, race-safe) — dipanggil RPC dari app saat order paid (0019).
create or replace function pos_decrement_stock(
  p_business uuid,
  p_product uuid,
  p_qty integer
) returns boolean
language plpgsql
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

create table transactions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  outlet_id uuid not null references outlets (id) on delete cascade,
  photobox_id uuid not null references photoboxes (id) on delete cascade,
  session_id uuid references sessions (id) on delete set null,
  event_id uuid,
  customer_id uuid,
  package_id uuid references packages (id) on delete set null,
  payment_method text not null default 'qris'
    -- 'gateway' dihapus (0036): direct-merchant QRIS collapse ke 'qris'; 'manual'
    -- eksplisit untuk pencatatan owner (non-withdrawable, 0033). 'voucher'
    -- untuk checkout voucher-only (final_amount=0) — 0063.
    check (payment_method in ('qris', 'cash', 'bank_transfer', 'other', 'offline', 'manual', 'voucher')),
  gross_amount integer not null check (gross_amount >= 0),
  discount_amount integer not null default 0 check (discount_amount >= 0),
  final_amount integer not null check (final_amount >= 0),
  voucher_id uuid,
  -- Non-withdrawable (0033): manual & offline → false; QRIS Pakasir → true.
  -- Uang manual/offline hanya reporting, TIDAK masuk saldo penarikan.
  withdrawable boolean not null default true,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed', 'cancelled', 'refunded')),
  number text not null unique,
  pos_order_id uuid references pos_orders (id) on delete set null,  -- POS add-on (0019)
  cashier_user_id uuid references users (id) on delete set null,    -- kasir POS (0019)
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_tx_business_status on transactions (business_id, status);
create index idx_tx_business_date on transactions (business_id, created_at);
-- Query terpanas dashboard: paid per rentang paid_at (src/server/dashboard.ts)
create index idx_tx_business_paid on transactions (business_id, paid_at) where status = 'paid';
create index idx_tx_business_outlet on transactions (business_id, outlet_id);
create index idx_tx_session on transactions (session_id);
create index idx_tx_pos_order on transactions (pos_order_id);  -- POS add-on (0019)
-- One transaction per POS order (0026) — safety net for app-level idempotency.
create unique index idx_tx_pos_order_unique on transactions (pos_order_id)
  where pos_order_id is not null;
create trigger trg_transactions_updated_at before update on transactions
  for each row execute function set_updated_at();

create table checkout_sessions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  outlet_id uuid references outlets (id) on delete set null,
  photobox_id uuid references photoboxes (id) on delete set null,
  session_id uuid references sessions (id) on delete set null,
  package_id uuid not null references packages (id) on delete restrict,
  voucher_id uuid,
  gross_amount integer not null check (gross_amount >= 0),
  discount_amount integer not null default 0 check (discount_amount >= 0),
  final_amount integer not null check (final_amount >= 0),
  currency text not null default 'IDR',
  status text not null default 'open'
    check (status in ('open', 'paid', 'expired', 'cancelled')),
  result_token text unique,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_checkout_business_status on checkout_sessions (business_id, status);
create index idx_checkout_session on checkout_sessions (session_id);  -- hot path finalize/result lookup (kiosk-sessions)
create unique index uq_checkout_open_per_photobox on checkout_sessions (photobox_id)
  where status = 'open' and photobox_id is not null;
create trigger trg_checkout_sessions_updated_at before update on checkout_sessions
  for each row execute function set_updated_at();

create table payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  transaction_id uuid references transactions (id) on delete set null,
  checkout_session_id uuid not null references checkout_sessions (id) on delete restrict,
  session_id uuid references sessions (id) on delete set null,
  outlet_id uuid references outlets (id) on delete set null,
  photobox_id uuid references photoboxes (id) on delete set null,
  package_id uuid references packages (id) on delete set null,
  gross_amount integer not null check (gross_amount >= 0),
  discount_amount integer not null default 0 check (discount_amount >= 0),
  voucher_id uuid,
  final_amount integer not null check (final_amount >= 0),
  order_id text unique,
  amount_uniq integer,
  total_amount integer check (total_amount >= 0),
  provider_signature text,
  provider text not null default 'pakasir',
  payment_reference text unique,
  status text not null default 'pending'
    check (status in ('creating', 'pending', 'paid', 'failed', 'expired', 'cancelled', 'refunded')),
  qr_string text,
  expires_at timestamptz,
  credential_id uuid,  -- Direct Merchant credential (0027); NULL = aggregator mode
  provider_ref text,  -- Pakasir v2 txn_id (dipakai getStatus transaction-status)
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_pay_business_status on payments (business_id, status);
create index idx_pay_checkout on payments (checkout_session_id);
create unique index idx_pay_reference on payments (provider, payment_reference)
  where payment_reference is not null;
-- Satu payment aktif (creating/pending) per checkout (0059) — anti race settle ganda.
create unique index uq_pay_active_per_checkout on payments (checkout_session_id)
  where status in ('creating', 'pending');
alter table transactions add column payment_id uuid references payments (id) on delete set null;
create unique index uq_transaction_payment on transactions (payment_id)
  where payment_id is not null;
create trigger trg_payments_updated_at before update on payments
  for each row execute function set_updated_at();

-- Pembayaran invoice subscription via QRIS (0011) — terpisah dari payments
-- (checkout kiosk); webhook pakasir bercabang saat order_id bukan payment.
create table invoice_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  invoice_id uuid not null references invoices (id) on delete cascade,
  amount integer not null check (amount >= 0),
  total_amount integer check (total_amount >= 0),
  order_id text unique,
  payment_reference text unique,
  provider_signature text,
  provider text not null default 'pakasir',
  status text not null default 'pending'
    check (status in ('creating', 'pending', 'paid', 'expired')),
  qr_string text,
  expires_at timestamptz,
  paid_at timestamptz,
  provider_ref text,  -- Pakasir v2 txn_id (dipakai getStatus transaction-status)
  credential_id uuid references payment_credentials (id) on delete set null,  -- Direct Merchant credential (0047); NULL = aggregator mode
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_invpay_business_status on invoice_payments (business_id, status);
create index idx_invpay_invoice on invoice_payments (invoice_id);
create unique index uq_invpay_active_per_invoice on invoice_payments (invoice_id)
  where status in ('creating', 'pending');
create trigger trg_invoice_payments_updated_at before update on invoice_payments
  for each row execute function set_updated_at();

create table payment_webhooks (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null unique,
  event_type text,
  payload jsonb,
  signature_valid boolean,
  status text not null default 'received'
    check (status in ('received', 'processed', 'ignored', 'error')),
  payment_id uuid references payments (id) on delete set null,
  error text,
  received_at timestamptz not null default now()
);
create index idx_payment_webhooks_payment on payment_webhooks (payment_id);

-- ============================================================================
-- 7.6 People & Business Data
-- ============================================================================

create table customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  name text,
  phone text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_customers_business on customers (business_id);
create trigger trg_customers_updated_at before update on customers
  for each row execute function set_updated_at();

create table bookings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  customer_name text not null,
  customer_contact text,
  -- docs/07 §7.6: interval timestamptz, `date`+`time` DILARANG. Simpan UTC,
  -- tampilkan sesuai businesses.timezone.
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  package_id uuid references packages (id) on delete set null,
  outlet_id uuid references outlets (id) on delete set null,
  photobox_id uuid references photoboxes (id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bookings_interval_valid check (ends_at > starts_at),
  constraint bookings_resource_required check (photobox_id is not null or outlet_id is not null)
);
create index idx_bookings_business_date on bookings (business_id, starts_at);
-- Anti-overlap per resource (docs/07 §7.6): level photobox & level outlet
-- (outlet-level = photobox_id null). Konflik lintas level (booking outlet vs
-- booking photobox di outlet itu) dicek server-side — BOOKING_SLOT_CONFLICT.
create extension if not exists btree_gist;
alter table bookings add constraint bookings_no_overlap_photobox
  exclude using gist (photobox_id with =, tstzrange(starts_at, ends_at) with &&)
  where (photobox_id is not null and status in ('pending', 'confirmed', 'completed'));
alter table bookings add constraint bookings_no_overlap_outlet
  exclude using gist (outlet_id with =, tstzrange(starts_at, ends_at) with &&)
  where (photobox_id is null and status in ('pending', 'confirmed', 'completed'));
create trigger trg_bookings_updated_at before update on bookings
  for each row execute function set_updated_at();

create table expenses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  outlet_id uuid references outlets (id) on delete set null,
  category text not null default 'other'
    check (category in ('rent', 'electricity', 'internet', 'paper', 'ink', 'maintenance', 'staff', 'equipment', 'advertising', 'other')),
  amount integer not null check (amount >= 0),
  note text,
  expense_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_expenses_business on expenses (business_id, expense_date);
create trigger trg_expenses_updated_at before update on expenses
  for each row execute function set_updated_at();

-- ============================================================================
-- 7.7 Voucher
-- ============================================================================

create table vouchers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  code text not null,
  type text not null default 'percentage' check (type in ('percentage', 'fixed')),
  amount integer not null check (amount > 0),
  start_date timestamptz,
  end_date timestamptz,
  usage_limit integer check (usage_limit is null or usage_limit >= 0),
  usage_per_customer integer not null default 1 check (usage_per_customer >= 1),
  min_transaction integer not null default 0 check (min_transaction >= 0),
  max_discount integer check (max_discount is null or max_discount >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, code)
);
create index idx_vouchers_business on vouchers (business_id, is_active);
create trigger trg_vouchers_updated_at before update on vouchers
  for each row execute function set_updated_at();

create table voucher_packages (
  voucher_id uuid not null references vouchers (id) on delete cascade,
  package_id uuid not null references packages (id) on delete cascade,
  primary key (voucher_id, package_id)
);

create table voucher_outlets (
  voucher_id uuid not null references vouchers (id) on delete cascade,
  outlet_id uuid not null references outlets (id) on delete cascade,
  primary key (voucher_id, outlet_id)
);

create table voucher_usages (
  id uuid primary key default gen_random_uuid(),
  voucher_id uuid not null references vouchers (id) on delete restrict,
  business_id uuid not null references businesses (id) on delete cascade,
  customer_id uuid references customers (id) on delete set null,
  transaction_id uuid references transactions (id) on delete set null,
  payment_id uuid references payments (id) on delete set null,
  discount_amount integer not null check (discount_amount >= 0),
  used_at timestamptz not null default now()
);
create index idx_vu_voucher on voucher_usages (voucher_id);
create index idx_vu_business on voucher_usages (business_id);
create unique index uq_voucher_usage_payment on voucher_usages (payment_id)
  where payment_id is not null;
create unique index uq_voucher_usage_transaction on voucher_usages (transaction_id)
  where transaction_id is not null;

-- ============================================================================
-- 7.8 Event
-- ============================================================================

create table events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  name text not null,
  event_code text not null unique,
  date date,
  branding jsonb,
  logo_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_events_business on events (business_id);
create trigger trg_events_updated_at before update on events
  for each row execute function set_updated_at();

create table event_templates (
  event_id uuid not null references events (id) on delete cascade,
  template_id uuid not null references templates (id) on delete cascade,
  primary key (event_id, template_id)
);

-- ============================================================================
-- 7.9 Admin / Platform
-- ============================================================================

create table platform_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
create trigger trg_platform_settings_updated_at before update on platform_settings
  for each row execute function set_updated_at();

-- Tabel `reports` dihapus 2026-09-16 (migration 0038). Tidak pernah di-query.
-- Fitur laporan berkala akan didesain ulang bila diperlukan.

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references users (id) on delete set null,
  business_id uuid references businesses (id) on delete set null,
  action text not null,
  target text,
  meta jsonb,
  created_at timestamptz not null default now()
);
create index idx_audit_business on audit_logs (business_id, created_at);
create index idx_audit_actor on audit_logs (actor_id);

-- ============================================================================
-- 7.10 Support Tickets (owner bantuan — migration 0050)
-- ============================================================================

create table support_tickets (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  created_by uuid not null references users (id) on delete cascade,
  subject text not null check (char_length(subject) between 1 and 200),
  category text not null check (char_length(category) between 1 and 60),
  area text not null check (char_length(area) between 1 and 60),
  description text not null check (char_length(description) between 1 and 4000),
  status text not null default 'open'
    check (status in ('open', 'needs_action', 'resolved')),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_support_tickets_business on support_tickets (business_id, created_at desc);
create index idx_support_tickets_status on support_tickets (status);
create trigger trg_support_tickets_updated_at before update on support_tickets
  for each row execute function set_updated_at();

create table support_ticket_replies (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references support_tickets (id) on delete cascade,
  author_id uuid not null references users (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index idx_support_ticket_replies_ticket on support_ticket_replies (ticket_id, created_at);

-- ============================================================================
-- Broadcast email (marketing/pengumuman admin — migration 0057)
-- ============================================================================

create table broadcast_campaigns (
  id uuid primary key default gen_random_uuid(),
  subject text not null check (char_length(subject) between 1 and 200),
  body text not null check (char_length(body) >= 1),
  kind text not null default 'announcement'
    check (kind in ('announcement', 'promo', 'newsletter', 'event', 'system')),
  template_key text not null default 'default'
    check (template_key in ('default', 'announcement', 'promo', 'newsletter', 'event', 'system')),
  audience text not null default 'all'
    check (audience in ('all', 'users', 'owners')),
  status text not null default 'draft'
    check (status in ('draft', 'sending', 'sent', 'partial', 'failed')),
  max_resend integer not null default 3 check (max_resend between 0 and 10),
  resend_count integer not null default 0 check (resend_count >= 0),
  created_by uuid references users (id) on delete set null,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_broadcast_campaigns_status on broadcast_campaigns (status, created_at desc);
create trigger trg_broadcast_campaigns_updated_at before update on broadcast_campaigns
  for each row execute function set_updated_at();

create table broadcast_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references broadcast_campaigns (id) on delete cascade,
  email text not null check (char_length(email) between 3 and 254),
  kind text not null check (kind in ('user', 'business')),
  name text,
  user_id uuid references users (id) on delete set null,
  business_id uuid references businesses (id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed')),
  error text,
  provider_message_id text,
  resend_count integer not null default 0,
  last_sent_at timestamptz,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_broadcast_recipients_campaign on broadcast_recipients (campaign_id, status);
create index idx_broadcast_recipients_email on broadcast_recipients (email);
create index idx_broadcast_recipients_kind on broadcast_recipients (kind);
-- Satu penerima unik per kampanye (migration 0068) — basis upsert aman re-send.
create unique index uq_broadcast_recipients_campaign_email
  on broadcast_recipients (campaign_id, lower(email));

-- Migration 0060 — Subscription lifecycle email otomatis (Resend).
create table lifecycle_emails (
  id uuid primary key default gen_random_uuid(),
  email text not null check (char_length(email) between 3 and 254),
  kind text not null
    check (kind in ('welcome', 'subscription_started', 'expiry_reminder')),
  ref text not null,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed')),
  subject text not null,
  provider_message_id text,
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index idx_lifecycle_emails_pending_unique
  on lifecycle_emails (email, kind, ref)
  where status = 'pending';
create index idx_lifecycle_emails_ref on lifecycle_emails (kind, ref);

-- ============================================================================
-- Seed: plans, add_ons, platform_settings
-- ============================================================================

-- Model perangkat = add-on (docs/02 §2.2): SEMUA plan base 1 outlet /
-- 1 photobox / 1 perangkat online; tambahan perangkat via add-on.
-- Yang membedakan plan hanyalah fitur (features jsonb).
insert into plans (code, name, price_monthly, price_yearly, billing_cycle, max_businesses, max_outlets, max_photoboxes, max_concurrent_sessions, max_staff, storage_limit_mb, platform_fee_percent, platform_fee_flat, features) values
  ('starter', 'Starter', 99000, 990000, 'monthly', 1, 1, 1, 1, 0, 1024, 0, 0,
   '{"voucher": false, "finance": false, "reports": false, "custom_domain": false, "white_label": false, "staff": false, "event_mode": false, "booking": false, "qr_delivery": true, "direct_payment": false, "storage": false, "cash_payment": false}'::jsonb),
  ('growth', 'Growth', 249000, 2490000, 'monthly', 1, 1, 1, 1, 5, 5120, 0, 0,
   '{"voucher": false, "finance": true, "reports": false, "custom_domain": false, "white_label": false, "staff": true, "event_mode": false, "booking": true, "qr_delivery": true, "direct_payment": true, "storage": false, "cash_payment": true}'::jsonb),
  ('business', 'Business', 499000, 4990000, 'monthly', 1, 1, 1, 1, 20, 20480, 0, 0,
   '{"voucher": true, "finance": true, "reports": true, "custom_domain": true, "white_label": true, "staff": true, "event_mode": true, "booking": true, "qr_delivery": true, "direct_payment": true, "storage": true, "cash_payment": true}'::jsonb)
on conflict (code) do nothing;

insert into add_ons (code, name, price_monthly, unit, is_active, storage_mb) values
  ('extra_session', 'Add-on +1 Sesi', 49000, 'session', true, null),
  ('pos', 'POS Kasir', 99000, 'feature', true, null),
  ('extra_storage', 'Tambah Storage 1.024 MB', 49000, 'storage', true, 1024)
on conflict (code) do nothing;

insert into platform_settings (key, value) values
  ('platform_fee_percent', '0'::jsonb),
  ('default_retention_days', '3'::jsonb),
  ('trial_days', '14'::jsonb),
  ('maintenance_mode', 'false'::jsonb),
  ('maintenance_message', '"Platform sedang perawatan sistem. Coba lagi beberapa saat."'::jsonb),
  ('gateway_pakasir_enabled', 'true'::jsonb),
  ('gateway_midtrans_enabled', 'true'::jsonb),
  ('gateway_tripay_enabled', 'true'::jsonb)
on conflict (key) do nothing;

-- ============================================================================
-- FK tertunda — entity target dibuat setelah tabel sumber (docs/07 §7.4–7.7)
-- ============================================================================

alter table sessions
  add constraint sessions_event_id_fkey foreign key (event_id) references events (id) on delete set null,
  add constraint sessions_customer_id_fkey foreign key (customer_id) references customers (id) on delete set null;

alter table transactions
  add constraint transactions_event_id_fkey foreign key (event_id) references events (id) on delete set null,
  add constraint transactions_customer_id_fkey foreign key (customer_id) references customers (id) on delete set null,
  add constraint transactions_voucher_id_fkey foreign key (voucher_id) references vouchers (id) on delete set null;

alter table checkout_sessions
  add constraint checkout_sessions_voucher_id_fkey foreign key (voucher_id) references vouchers (id) on delete set null;

alter table payments
  add constraint payments_voucher_id_fkey foreign key (voucher_id) references vouchers (id) on delete set null;

-- ============================================================================
-- Subscription promos (platform billing — docs/02 §2.5, migration 0014)
-- ============================================================================

create table subscription_promos (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  type text not null default 'percentage' check (type in ('percentage', 'fixed')),
  amount integer not null check (amount > 0),
  min_transaction integer not null default 0 check (min_transaction >= 0),
  max_discount integer check (max_discount is null or max_discount >= 0),
  start_date timestamptz,
  end_date timestamptz,
  usage_limit integer check (usage_limit is null or usage_limit >= 0),
  used_count integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index idx_subscription_promos_active on subscription_promos (is_active, code);

-- ============================================================================
-- Payment credentials per business — Direct Merchant (0027)
-- ============================================================================

create table payment_credentials (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  provider text not null check (provider in ('midtrans', 'tripay', 'pakasir')),
  label text,
  merchant_id text not null,
  server_key_encrypted text not null,
  client_key text,
  environment text not null default 'sandbox'
    check (environment in ('sandbox', 'production')),
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_credentials_unique_active
    unique (business_id, provider, environment)
);
create index idx_payment_creds_business on payment_credentials (business_id, is_active);
create trigger trg_payment_credentials_updated_at before update on payment_credentials
  for each row execute function set_updated_at();

-- FK tertunda: payments.credential_id → payment_credentials (0027)
alter table payments
  add constraint payments_credential_id_fkey
  foreign key (credential_id) references payment_credentials (id) on delete set null;

-- ============================================================================
-- Device logs — riwayat per device, auto-cleanup 30d via cron (0027)
-- ============================================================================

create table device_logs (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references devices (id) on delete cascade,
  level text not null default 'info'
    check (level in ('debug', 'info', 'warn', 'error')),
  category text not null default 'system',
  message text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index idx_device_logs_device_time on device_logs (device_id, created_at desc);

-- ============================================================================
-- Storage buckets (docs/09 §9.7)
-- ============================================================================

insert into storage.buckets (id, name, public) values
  ('business-assets', 'business-assets', false),
  ('generated-photos', 'generated-photos', false),
  ('public-assets', 'public-assets', true)
on conflict (id) do nothing;

-- ============================================================================
-- Payment settlement RPCs — migrasi 0031 + patch 0040 (docs/06 §6.7, §6.12).
-- settle_paid_payment_atomically: idempotent side-effects after webhook paid.
-- create_voucher_payment_atomically: zero-amount voucher-only checkout.
-- ============================================================================

create or replace function settle_paid_payment_atomically(
  p_payment_id uuid,
  p_transaction_number text,
  p_result_token text
) returns table (transaction_number text, result_token text, settled_now boolean)
language plpgsql
as $$
declare
  v_payment payments%rowtype;
  v_checkout checkout_sessions%rowtype;
  v_transaction_id uuid;
  v_existing_settled boolean;
  v_settled_now boolean := false;
begin
  select * into v_payment from payments where id = p_payment_id for update;
  if not found or v_payment.status <> 'paid' then raise exception 'paid payment not found'; end if;
  select * into v_checkout from checkout_sessions where id = v_payment.checkout_session_id for update;
  if not found then raise exception 'checkout not found'; end if;

  v_transaction_id := v_payment.transaction_id;
  if v_transaction_id is null then
    -- Anti double-settle: hanya insert bila belum ada payment paid lain di
    -- checkout yang sama yang sudah punya transaction (recovery expired→paid
    -- tidak boleh menghasilkan transaction kedua).
    select exists (
      select 1 from payments p
       where p.checkout_session_id = v_payment.checkout_session_id
         and p.status = 'paid'
         and p.transaction_id is not null
         and p.id <> v_payment.id
    ) into v_existing_settled;

    if not v_existing_settled then
      insert into transactions (
        business_id, outlet_id, photobox_id, package_id, payment_id, payment_method,
        gross_amount, discount_amount, final_amount, voucher_id, withdrawable,
        status, number, paid_at
      ) values (
        v_payment.business_id, v_payment.outlet_id, v_payment.photobox_id, v_payment.package_id,
        v_payment.id,
        case when v_payment.provider = 'cash' then 'cash' else 'qris' end,
        v_payment.gross_amount, v_payment.discount_amount, v_payment.final_amount,
        v_payment.voucher_id,
        (v_payment.provider <> 'cash'),
        'paid', p_transaction_number, coalesce(v_payment.paid_at, now())
      ) returning id into v_transaction_id;
      update payments set transaction_id = v_transaction_id where id = v_payment.id;
      v_settled_now := true;
    end if;
  end if;

  if v_payment.voucher_id is not null and v_transaction_id is not null then
    insert into voucher_usages (voucher_id, business_id, transaction_id, payment_id, discount_amount)
    values (v_payment.voucher_id, v_payment.business_id, v_transaction_id, v_payment.id, v_payment.discount_amount)
    on conflict (payment_id) where payment_id is not null do nothing;
  end if;

  if v_checkout.status <> 'paid' then
    update checkout_sessions
       set status = 'paid', result_token = coalesce(v_checkout.result_token, p_result_token)
     where id = v_checkout.id;
  end if;

  return query select (
    select number from transactions where id = v_transaction_id
  ), coalesce(v_checkout.result_token, p_result_token), v_settled_now;
end;
$$;

create or replace function create_voucher_payment_atomically(
  p_checkout_id uuid,
  p_business_id uuid,
  p_payment_reference text,
  p_order_id text,
  p_transaction_number text,
  p_result_token text
) returns table (payment_id uuid, reason text)
language plpgsql
as $$
declare
  v_checkout checkout_sessions%rowtype;
  v_voucher vouchers%rowtype;
  v_payment_id uuid;
  v_transaction_id uuid;
  v_used integer;
begin
  select * into v_checkout from checkout_sessions
   where id = p_checkout_id and business_id = p_business_id for update;
  if not found or v_checkout.status <> 'open' or v_checkout.final_amount <> 0 or v_checkout.voucher_id is null then
    return query select null::uuid, 'INVALID'::text; return;
  end if;
  select * into v_voucher from vouchers where id = v_checkout.voucher_id for update;
  if not found then return query select null::uuid, 'INVALID'::text; return; end if;
  if v_voucher.usage_limit is not null then
    select count(*) into v_used from voucher_usages where voucher_id = v_voucher.id;
    if v_used >= v_voucher.usage_limit then
      return query select null::uuid, 'LIMIT'::text; return;
    end if;
  end if;
  insert into payments (
    business_id, checkout_session_id, outlet_id, photobox_id, package_id, gross_amount,
    discount_amount, voucher_id, final_amount, order_id, payment_reference, total_amount,
    provider, status, paid_at
  ) values (
    p_business_id, v_checkout.id, v_checkout.outlet_id, v_checkout.photobox_id, v_checkout.package_id,
    v_checkout.gross_amount, v_checkout.discount_amount, v_checkout.voucher_id, 0,
    p_order_id, p_payment_reference, 0, 'voucher', 'paid', now()
  ) returning id into v_payment_id;
  insert into transactions (
    business_id, outlet_id, photobox_id, package_id, payment_id, payment_method, gross_amount,
    discount_amount, final_amount, voucher_id, withdrawable, status, number, paid_at
  ) values (
    p_business_id, v_checkout.outlet_id, v_checkout.photobox_id, v_checkout.package_id, v_payment_id,
    'voucher', v_checkout.gross_amount, v_checkout.discount_amount, 0, v_checkout.voucher_id,
    false, 'paid', p_transaction_number, now()
  ) returning id into v_transaction_id;
  insert into voucher_usages (voucher_id, business_id, transaction_id, payment_id, discount_amount)
  values (v_checkout.voucher_id, p_business_id, v_transaction_id, v_payment_id, v_checkout.discount_amount);
  update payments set transaction_id = v_transaction_id where id = v_payment_id;
  update checkout_sessions set status = 'paid', result_token = coalesce(result_token, p_result_token)
   where id = v_checkout.id;
  return query select v_payment_id, 'OK'::text;
end;
$$;

revoke execute on function settle_paid_payment_atomically(uuid, text, text) from public, anon, authenticated;
revoke execute on function create_voucher_payment_atomically(uuid, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function settle_paid_payment_atomically(uuid, text, text) to service_role;
grant execute on function create_voucher_payment_atomically(uuid, uuid, text, text, text, text) to service_role;

-- ============================================================================
-- Exit-PIN atomic lockout (0059) — anti read-modify-write race pada
-- photoboxes.exit_pin_failed_count. Dipanggil devices.ts verifyDeviceExit.
-- ============================================================================

create or replace function exit_pin_register_failure(
  p_photobox_id uuid,
  p_threshold int,
  p_lock_ms bigint
) returns table (locked boolean, failed_count int, locked_until timestamptz)
language plpgsql
as $$
declare
  v_count int;
begin
  update photoboxes
     set exit_pin_failed_count = exit_pin_failed_count + 1
   where id = p_photobox_id
  returning exit_pin_failed_count into v_count;

  if v_count >= p_threshold then
    update photoboxes
       set exit_pin_failed_count = 0,
           exit_pin_locked_until = now() + (p_lock_ms::double precision / 1000.0) * interval '1 second'
     where id = p_photobox_id;
    return query select true, 0, now() + (p_lock_ms::double precision / 1000.0) * interval '1 second';
  else
    return query select false, v_count, null::timestamptz;
  end if;
end;
$$;

revoke execute on function exit_pin_register_failure(uuid, int, bigint) from public, anon, authenticated;
grant execute on function exit_pin_register_failure(uuid, int, bigint) to service_role;

-- ============================================================================
-- Dashboard owner agregasi SQL — Fase 3 / migrasi 0032 (docs/04 §4.1–§4.4)
-- Cerminan db/migrations/0032_dashboard_aggregates.sql (baseline akumulasi).
-- ============================================================================

-- Ringkasan transaksi paid pada rentang paid_at (dipakai dashboard + finance).
create or replace function dashboard_tx_summary(
  p_business uuid, p_start timestamptz, p_end timestamptz
)
returns table (gross bigint, discount bigint, net bigint, paid_tx bigint)
language sql stable as $$
  select coalesce(sum(gross_amount), 0)::bigint,
         coalesce(sum(discount_amount), 0)::bigint,
         coalesce(sum(final_amount), 0)::bigint,
         count(*)::bigint
    from transactions
   where business_id = p_business
     and status = 'paid'
     and paid_at >= p_start
     and paid_at < p_end;
$$;

-- Deret harian revenue (bucket tanggal lokal business tz; zero-fill tetap di TS).
create or replace function dashboard_daily_revenue(
  p_business uuid, p_start timestamptz, p_end timestamptz, p_tz text
)
returns table (day date, amount bigint, tx_count bigint)
language sql stable as $$
  select (timezone(p_tz, paid_at))::date as day,
         sum(greatest(final_amount, 0))::bigint as amount,
         count(*)::bigint as tx_count
    from transactions
   where business_id = p_business
     and status = 'paid'
     and paid_at >= p_start
     and paid_at < p_end
   group by 1
   order by 1;
$$;

-- Ringkasan expenses per kategori pada rentang expense_date.
create or replace function finance_expense_summary(
  p_business uuid, p_from date, p_to date
)
returns table (category text, amount bigint)
language sql stable as $$
  select category, sum(greatest(amount, 0))::bigint as amount
    from expenses
   where business_id = p_business
     and expense_date >= p_from
     and expense_date <= p_to
   group by category
   order by sum(amount) desc;
$$;

-- Breakdown revenue per dimensi (outlet | package | photobox | payment_method).
create or replace function revenue_breakdown(
  p_business uuid, p_start timestamptz, p_end timestamptz, p_dim text
)
returns table (dim_key text, label text, amount bigint, tx_count bigint)
language sql stable as $$
  select
    case p_dim
      when 'outlet' then coalesce(t.outlet_id::text, 'none')
      when 'package' then coalesce(t.package_id::text, 'none')
      when 'photobox' then coalesce(t.photobox_id::text, 'none')
      else coalesce(t.payment_method, '—')
    end as dim_key,
    case p_dim
      when 'outlet' then coalesce(o.name, 'Tanpa outlet')
      when 'package' then coalesce(p.name, 'Tanpa package')
      when 'photobox' then coalesce(b.name, 'Tanpa photobox')
      else upper(coalesce(t.payment_method, '—'))
    end as label,
    sum(greatest(t.final_amount, 0))::bigint as amount,
    count(*)::bigint as tx_count
    from transactions t
    left join outlets o on o.id = t.outlet_id
    left join packages p on p.id = t.package_id
    left join photoboxes b on b.id = t.photobox_id
   where t.business_id = p_business
     and t.status = 'paid'
     and t.paid_at >= p_start
     and t.paid_at < p_end
   group by 1, 2
   order by 3 desc;
$$;

-- Insights transaksi SEMUA status: grup (status, jam lokal, outlet).
-- Jam memakai coalesce(paid_at, created_at) — sama dengan buildTxInsights().
create or replace function tx_insights_summary(
  p_business uuid, p_start timestamptz, p_end timestamptz, p_tz text
)
returns table (
  status text, hr int, outlet_id uuid, outlet_name text,
  amount bigint, tx_count bigint
)
language sql stable as $$
  select t.status,
         extract(hour from timezone(p_tz, coalesce(t.paid_at, t.created_at)))::int as hr,
         t.outlet_id,
         coalesce(o.name, 'Tanpa outlet') as outlet_name,
         sum(case when t.status = 'paid' then greatest(t.final_amount, 0) else 0 end)::bigint as amount,
         count(*)::bigint as tx_count
    from transactions t
    left join outlets o on o.id = t.outlet_id
   where t.business_id = p_business
     and t.created_at >= p_start
     and t.created_at < p_end
   group by 1, 2, 3, 4;
$$;

-- Hitung status transaksi pada rentang created_at (metrics).
create or replace function metrics_tx_status(
  p_business uuid, p_start timestamptz, p_end timestamptz
)
returns table (status text, tx_count bigint)
language sql stable as $$
  select status, count(*)::bigint as tx_count
    from transactions
   where business_id = p_business
     and created_at >= p_start
     and created_at < p_end
   group by status;
$$;

-- Customer returning: ≥2 transaksi paid pada rentang (skalar, tanpa transfer rows).
create or replace function metrics_returning_customers(
  p_business uuid, p_start timestamptz, p_end timestamptz
)
returns bigint
language sql stable as $$
  select count(*)::bigint from (
    select 1
      from transactions
     where business_id = p_business
       and status = 'paid'
       and paid_at >= p_start
       and paid_at < p_end
       and customer_id is not null
     group by customer_id
    having count(*) >= 2
  ) t;
$$;

-- Revenue paid per booth pada rentang.
create or replace function metrics_revenue_per_booth(
  p_business uuid, p_start timestamptz, p_end timestamptz
)
returns table (booth_id uuid, revenue bigint, paid_tx bigint)
language sql stable as $$
  select photobox_id as booth_id,
         sum(greatest(final_amount, 0))::bigint as revenue,
         count(*)::bigint as paid_tx
    from transactions
   where business_id = p_business
     and status = 'paid'
     and paid_at >= p_start
     and paid_at < p_end
   group by photobox_id;
$$;

-- Jumlah sesi per booth pada rentang created_at.
create or replace function metrics_sessions_per_booth(
  p_business uuid, p_start timestamptz, p_end timestamptz
)
returns table (booth_id uuid, sessions bigint)
language sql stable as $$
  select photobox_id as booth_id, count(*)::bigint as sessions
    from sessions
   where business_id = p_business
     and created_at >= p_start
     and created_at < p_end
   group by photobox_id;
$$;

-- Ringkasan sesi: total/completed/cancelled/retakes + durasi (detik) untuk rata-rata.
create or replace function metrics_session_summary(
  p_business uuid, p_start timestamptz, p_end timestamptz
)
returns table (
  total bigint, completed bigint, cancelled bigint, retakes bigint,
  done_count bigint, total_seconds numeric
)
language sql stable as $$
  select count(*)::bigint as total,
         count(*) filter (where status = 'completed')::bigint as completed,
         count(*) filter (where status = 'cancelled')::bigint as cancelled,
         coalesce(sum(retake_count), 0)::bigint as retakes,
         count(*) filter (
           where status = 'completed'
             and started_at is not null
             and completed_at is not null
         )::bigint as done_count,
         coalesce(sum(
           extract(epoch from (completed_at - started_at))
           ) filter (
           where status = 'completed'
             and started_at is not null
             and completed_at is not null
         ), 0) as total_seconds
    from sessions
   where business_id = p_business
     and created_at >= p_start
     and created_at < p_end;
$$;

-- Package terpopuler (semua package + count, TS ambil [0]).
create or replace function metrics_popular_package(
  p_business uuid, p_start timestamptz, p_end timestamptz
)
returns table (package_id uuid, name text, tx_count bigint)
language sql stable as $$
  select t.package_id,
         coalesce(max(p.name), '—') as name,
         count(*)::bigint as tx_count
    from transactions t
    left join packages p on p.id = t.package_id
   where t.business_id = p_business
     and t.status = 'paid'
     and t.paid_at >= p_start
     and t.paid_at < p_end
     and t.package_id is not null
   group by t.package_id
   order by count(*) desc, max(p.name) asc;
$$;

-- Template terpopuler (semua template + count, TS ambil [0]).
create or replace function metrics_popular_template(
  p_business uuid, p_start timestamptz, p_end timestamptz
)
returns table (template_id uuid, name text, photo_count bigint)
language sql stable as $$
  select ph.template_id,
         coalesce(max(t.name), '—') as name,
         count(*)::bigint as photo_count
    from photos ph
    left join templates t on t.id = ph.template_id
   where ph.business_id = p_business
     and ph.created_at >= p_start
     and ph.created_at < p_end
     and ph.template_id is not null
   group by ph.template_id
   order by count(*) desc, max(t.name) asc;
$$;

-- Index pelengkap agregasi (gap audit Fase 3).
create index if not exists idx_voucher_usages_business_used
  on voucher_usages (business_id, used_at);
create index if not exists idx_customers_business_created
  on customers (business_id, created_at);
create index if not exists idx_sessions_business_created
  on sessions (business_id, created_at);

-- ============================================================================
-- Agregasi tambahan STEP 13 — cerminan db/migrations/0037_aggregation_rpcs.sql.
-- Menutup sisa loop TS: customer spending, staff directory, operational metrics.
-- Tidak menduplikat 0032: revenue harian = dashboard_daily_revenue,
-- breakdown per dimensi = revenue_breakdown(p_dim).
-- ============================================================================

create or replace function staff_directory_today(
  p_business uuid, p_start timestamptz, p_end timestamptz
)
returns table (photobox_id uuid, revenue bigint, tx_count bigint)
language sql stable as $$
  select photobox_id,
         coalesce(sum(greatest(final_amount, 0)), 0)::bigint as revenue,
         count(*)::bigint as tx_count
    from transactions
   where business_id = p_business
     and status = 'paid'
     and created_at >= p_start
     and created_at < p_end
     and photobox_id is not null
   group by photobox_id;
$$;

create or replace function customer_spending(
  p_business uuid, p_customer_ids uuid[]
)
returns table (
  customer_id uuid,
  total_spending bigint,
  tx_count bigint,
  last_active timestamptz
)
language sql stable as $$
  select customer_id,
         coalesce(sum(greatest(final_amount, 0)), 0)::bigint as total_spending,
         count(*)::bigint as tx_count,
         max(paid_at) as last_active
    from transactions
   where business_id = p_business
     and status = 'paid'
     and customer_id = any(p_customer_ids)
   group by customer_id;
$$;

create or replace function operational_metrics(
  p_business uuid, p_start timestamptz, p_end timestamptz
)
returns table (
  sessions bigint,
  customers bigint,
  active_photoboxes bigint,
  active_outlets bigint
)
language sql stable as $$
  select
    (select count(*)::bigint
       from sessions
      where business_id = p_business
        and created_at >= p_start
        and created_at < p_end) as sessions,
    (select count(*)::bigint
       from customers
      where business_id = p_business) as customers,
    (select count(*)::bigint
       from photoboxes
      where business_id = p_business
        and status = 'online') as active_photoboxes,
    (select count(*)::bigint
       from outlets
      where business_id = p_business
        and status = 'active') as active_outlets;
$$;

-- Index pendukung customer_spending. Komposit (business_id, status, paid_at)
-- sengaja tidak ditambahkan: partial index existing idx_tx_business_paid
-- (business_id, paid_at) WHERE status='paid' sudah meng-cover semua query paid tx.
-- Catatan: `idx_tx_paid_at` (paid_at saja, partial status='paid') dibuat oleh
-- 0067 untuk rentang waktu GLOBAL — beda kolom, bukan index yang dimaksud di sini.
create index if not exists idx_tx_customer
  on transactions (business_id, customer_id)
  where customer_id is not null;

-- ============================================================================
-- 7.zz Subscription intent activation failures — cerminan 0041.
-- Antrian review manual saat applyInvoiceIntent gagal aktivasi meski invoice
-- paid (owner cancel + cron flip → webhook paid tiba terlambat). Admin
-- meninjau di /admin/subscriptions/pending-review (activate manual atau
-- refund). Tanpa tabel ini, uang settled tapi plan/add-on tidak aktif dan
-- tidak ada jejak — bug silent data loss.
-- ============================================================================

create table if not exists subscription_intent_failures (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  invoice_id uuid not null references invoices (id) on delete cascade,
  subscription_id uuid references subscriptions (id) on delete set null,
  reason text not null,
  message text,
  intent_snapshot jsonb not null,
  amount integer not null check (amount >= 0),
  status text not null default 'pending'
    check (status in ('pending', 'activated', 'refunded', 'dismissed')),
  resolved_by uuid references users (id) on delete set null,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_intent_failures_open
  on subscription_intent_failures (invoice_id, reason)
  where status = 'pending';
create index if not exists idx_intent_failures_business
  on subscription_intent_failures (business_id, created_at desc);
create index if not exists idx_intent_failures_status
  on subscription_intent_failures (status, created_at desc);

alter table subscription_intent_failures enable row level security;
drop policy if exists svc_all on subscription_intent_failures;
create policy svc_all on subscription_intent_failures for all to service_role using (true) with check (true);

create or replace function tg_subscription_intent_failures_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_intent_failures_touch on subscription_intent_failures;
create trigger trg_intent_failures_touch
  before update on subscription_intent_failures
  for each row execute function tg_subscription_intent_failures_touch();

-- ============================================================================
-- Storage usage accounting (migration 0062) — counter O(1) pengganti recursive
-- listing bucket pada hot-path upload/finalize. Ledger objek (storage_objects)
-- = sumber kebenaran delta; counter agregat (storage_usage) dibaca hot-path.
-- ============================================================================

create table if not exists storage_objects (
  object_key text primary key,
  business_id uuid not null references businesses (id) on delete cascade,
  bucket text not null,
  bytes bigint not null check (bytes >= 0),
  created_at timestamptz not null default now()
);
create index if not exists idx_storage_objects_business on storage_objects (business_id);
create index if not exists idx_storage_objects_bucket on storage_objects (bucket);

create table if not exists storage_usage (
  business_id uuid primary key references businesses (id) on delete cascade,
  used_bytes bigint not null default 0 check (used_bytes >= 0),
  updated_at timestamptz not null default now()
);

create or replace function storage_account_add(
  p_business uuid, p_key text, p_bucket text, p_bytes bigint
)
returns bigint
language plpgsql as $$
declare
  inserted int;
  current_bytes bigint;
begin
  if p_bytes is null or p_bytes < 0 then
    p_bytes := 0;
  end if;

  insert into storage_usage (business_id, used_bytes, updated_at)
  values (p_business, 0, now())
  on conflict (business_id) do nothing;

  insert into storage_objects (object_key, business_id, bucket, bytes)
  values (p_key, p_business, p_bucket, p_bytes)
  on conflict (object_key) do nothing;
  get diagnostics inserted = row_count;

  if inserted > 0 and p_bytes > 0 then
    update storage_usage
       set used_bytes = used_bytes + p_bytes,
           updated_at = now()
     where business_id = p_business
     returning used_bytes into current_bytes;
  else
    select used_bytes into current_bytes
      from storage_usage where business_id = p_business;
  end if;

  return coalesce(current_bytes, 0);
end;
$$;

create or replace function storage_account_sub(
  p_business uuid, p_keys text[]
)
returns bigint
language plpgsql as $$
declare
  freed bigint;
  current_bytes bigint;
begin
  insert into storage_usage (business_id, used_bytes, updated_at)
  values (p_business, 0, now())
  on conflict (business_id) do nothing;

  select coalesce(sum(bytes), 0) into freed
    from storage_objects
   where business_id = p_business
     and object_key = any(p_keys);

  delete from storage_objects
   where business_id = p_business
     and object_key = any(p_keys);

  if freed > 0 then
    update storage_usage
       set used_bytes = greatest(0, used_bytes - freed),
           updated_at = now()
     where business_id = p_business
     returning used_bytes into current_bytes;
  else
    select used_bytes into current_bytes
      from storage_usage where business_id = p_business;
  end if;

  return coalesce(current_bytes, 0);
end;
$$;

-- ============================================================================
-- Admin bootstrap RPC (migration 0052) — promosi eksplisit user ke role admin.
-- ============================================================================

create or replace function bootstrap_admin(p_email text)
returns table (user_id uuid, user_email text, user_role text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_email is null or p_email = '' then
    raise exception 'EMAIL_WAJIB: bootstrap_admin butuh email user';
  end if;

  update users set role = 'admin', updated_at = now()
   where email = lower(p_email)
  returning id, email, role into user_id, user_email, user_role;

  if not found then
    raise exception 'USER_TIDAK_DITEMUKAN: %', p_email;
  end if;

  return next;
end;
$$;

revoke execute on function bootstrap_admin(text) from public, anon, authenticated;
grant execute on function bootstrap_admin(text) to service_role;

-- ============================================================================
-- RLS (migration 0064) — C1: enable row level security di SEMUA tabel publik.
-- Aplikasi hanya memakai service_role; anon/authenticated ditutup dari
-- PostgREST. Pola mengikuti subscription_intent_failures (RLS ON + policy
-- svc_all untuk service_role, TANPA policy to public/anon/authenticated).
-- ============================================================================

alter table if exists users enable row level security;
alter table if exists businesses enable row level security;
alter table if exists business_members enable row level security;
alter table if exists business_settings enable row level security;
alter table if exists plans enable row level security;
alter table if exists subscriptions enable row level security;
alter table if exists invoices enable row level security;
alter table if exists add_ons enable row level security;
alter table if exists subscription_add_ons enable row level security;
alter table if exists outlets enable row level security;
alter table if exists photoboxes enable row level security;
alter table if exists member_photoboxes enable row level security;
alter table if exists devices enable row level security;
alter table if exists activation_codes enable row level security;
alter table if exists packages enable row level security;
alter table if exists template_categories enable row level security;
alter table if exists templates enable row level security;
alter table if exists stickers enable row level security;
alter table if exists package_templates enable row level security;
alter table if exists package_outlets enable row level security;
alter table if exists package_photoboxes enable row level security;
alter table if exists business_template_purchases enable row level security;
alter table if exists sessions enable row level security;
alter table if exists photos enable row level security;
alter table if exists pos_products enable row level security;
alter table if exists pos_orders enable row level security;
alter table if exists pos_order_items enable row level security;
alter table if exists transactions enable row level security;
alter table if exists checkout_sessions enable row level security;
alter table if exists payments enable row level security;
alter table if exists invoice_payments enable row level security;
alter table if exists payment_webhooks enable row level security;
alter table if exists customers enable row level security;
alter table if exists bookings enable row level security;
alter table if exists expenses enable row level security;
alter table if exists vouchers enable row level security;
alter table if exists voucher_packages enable row level security;
alter table if exists voucher_outlets enable row level security;
alter table if exists voucher_usages enable row level security;
alter table if exists events enable row level security;
alter table if exists event_templates enable row level security;
alter table if exists platform_settings enable row level security;
alter table if exists audit_logs enable row level security;
alter table if exists support_tickets enable row level security;
alter table if exists support_ticket_replies enable row level security;
alter table if exists broadcast_campaigns enable row level security;
alter table if exists broadcast_recipients enable row level security;
alter table if exists lifecycle_emails enable row level security;
alter table if exists subscription_promos enable row level security;
alter table if exists payment_credentials enable row level security;
alter table if exists device_logs enable row level security;
alter table if exists storage_objects enable row level security;
alter table if exists storage_usage enable row level security;

revoke all on users, auth_sessions, businesses, business_members, business_settings, plans,
  subscriptions, invoices, add_ons, subscription_add_ons, outlets, photoboxes,
  member_photoboxes, devices, activation_codes, packages, template_categories,
  templates, stickers, package_templates, package_outlets, package_photoboxes,
  business_template_purchases, sessions, photos, pos_products, pos_orders,
  pos_order_items, transactions, checkout_sessions, payments, invoice_payments,
  payment_webhooks, customers, bookings, expenses, vouchers, voucher_packages,
  voucher_outlets, voucher_usages, events, event_templates, platform_settings,
  audit_logs, support_tickets, support_ticket_replies, broadcast_campaigns,
  broadcast_recipients, lifecycle_emails, subscription_promos,
  payment_credentials, device_logs, storage_objects, storage_usage,
  subscription_intent_failures
  from anon, authenticated;

grant all on users, auth_sessions, businesses, business_members, business_settings, plans,
  subscriptions, invoices, add_ons, subscription_add_ons, outlets, photoboxes,
  member_photoboxes, devices, activation_codes, packages, template_categories,
  templates, stickers, package_templates, package_outlets, package_photoboxes,
  business_template_purchases, sessions, photos, pos_products, pos_orders,
  pos_order_items, transactions, checkout_sessions, payments, invoice_payments,
  payment_webhooks, customers, bookings, expenses, vouchers, voucher_packages,
  voucher_outlets, voucher_usages, events, event_templates, platform_settings,
  audit_logs, support_tickets, support_ticket_replies, broadcast_campaigns,
  broadcast_recipients, lifecycle_emails, subscription_promos,
  payment_credentials, device_logs, storage_objects, storage_usage,
  subscription_intent_failures
  to service_role;

drop policy if exists svc_all on auth_sessions;
create policy svc_all on auth_sessions for all to service_role using (true) with check (true);
drop policy if exists svc_all on users;
create policy svc_all on users for all to service_role using (true) with check (true);
drop policy if exists svc_all on businesses;
create policy svc_all on businesses for all to service_role using (true) with check (true);
drop policy if exists svc_all on business_members;
create policy svc_all on business_members for all to service_role using (true) with check (true);
drop policy if exists svc_all on business_settings;
create policy svc_all on business_settings for all to service_role using (true) with check (true);
drop policy if exists svc_all on plans;
create policy svc_all on plans for all to service_role using (true) with check (true);
drop policy if exists svc_all on subscriptions;
create policy svc_all on subscriptions for all to service_role using (true) with check (true);
drop policy if exists svc_all on invoices;
create policy svc_all on invoices for all to service_role using (true) with check (true);
drop policy if exists svc_all on add_ons;
create policy svc_all on add_ons for all to service_role using (true) with check (true);
drop policy if exists svc_all on subscription_add_ons;
create policy svc_all on subscription_add_ons for all to service_role using (true) with check (true);
drop policy if exists svc_all on outlets;
create policy svc_all on outlets for all to service_role using (true) with check (true);
drop policy if exists svc_all on photoboxes;
create policy svc_all on photoboxes for all to service_role using (true) with check (true);
drop policy if exists svc_all on member_photoboxes;
create policy svc_all on member_photoboxes for all to service_role using (true) with check (true);
drop policy if exists svc_all on devices;
create policy svc_all on devices for all to service_role using (true) with check (true);
drop policy if exists svc_all on activation_codes;
create policy svc_all on activation_codes for all to service_role using (true) with check (true);
drop policy if exists svc_all on packages;
create policy svc_all on packages for all to service_role using (true) with check (true);
drop policy if exists svc_all on template_categories;
create policy svc_all on template_categories for all to service_role using (true) with check (true);
drop policy if exists svc_all on templates;
create policy svc_all on templates for all to service_role using (true) with check (true);
drop policy if exists svc_all on stickers;
create policy svc_all on stickers for all to service_role using (true) with check (true);
drop policy if exists svc_all on package_templates;
create policy svc_all on package_templates for all to service_role using (true) with check (true);
drop policy if exists svc_all on package_outlets;
create policy svc_all on package_outlets for all to service_role using (true) with check (true);
drop policy if exists svc_all on package_photoboxes;
create policy svc_all on package_photoboxes for all to service_role using (true) with check (true);
drop policy if exists svc_all on business_template_purchases;
create policy svc_all on business_template_purchases for all to service_role using (true) with check (true);
drop policy if exists svc_all on sessions;
create policy svc_all on sessions for all to service_role using (true) with check (true);
drop policy if exists svc_all on photos;
create policy svc_all on photos for all to service_role using (true) with check (true);
drop policy if exists svc_all on pos_products;
create policy svc_all on pos_products for all to service_role using (true) with check (true);
drop policy if exists svc_all on pos_orders;
create policy svc_all on pos_orders for all to service_role using (true) with check (true);
drop policy if exists svc_all on pos_order_items;
create policy svc_all on pos_order_items for all to service_role using (true) with check (true);
drop policy if exists svc_all on transactions;
create policy svc_all on transactions for all to service_role using (true) with check (true);
drop policy if exists svc_all on checkout_sessions;
create policy svc_all on checkout_sessions for all to service_role using (true) with check (true);
drop policy if exists svc_all on payments;
create policy svc_all on payments for all to service_role using (true) with check (true);
drop policy if exists svc_all on invoice_payments;
create policy svc_all on invoice_payments for all to service_role using (true) with check (true);
drop policy if exists svc_all on payment_webhooks;
create policy svc_all on payment_webhooks for all to service_role using (true) with check (true);
drop policy if exists svc_all on customers;
create policy svc_all on customers for all to service_role using (true) with check (true);
drop policy if exists svc_all on bookings;
create policy svc_all on bookings for all to service_role using (true) with check (true);
drop policy if exists svc_all on expenses;
create policy svc_all on expenses for all to service_role using (true) with check (true);
drop policy if exists svc_all on vouchers;
create policy svc_all on vouchers for all to service_role using (true) with check (true);
drop policy if exists svc_all on voucher_packages;
create policy svc_all on voucher_packages for all to service_role using (true) with check (true);
drop policy if exists svc_all on voucher_outlets;
create policy svc_all on voucher_outlets for all to service_role using (true) with check (true);
drop policy if exists svc_all on voucher_usages;
create policy svc_all on voucher_usages for all to service_role using (true) with check (true);
drop policy if exists svc_all on events;
create policy svc_all on events for all to service_role using (true) with check (true);
drop policy if exists svc_all on event_templates;
create policy svc_all on event_templates for all to service_role using (true) with check (true);
drop policy if exists svc_all on platform_settings;
create policy svc_all on platform_settings for all to service_role using (true) with check (true);
drop policy if exists svc_all on audit_logs;
create policy svc_all on audit_logs for all to service_role using (true) with check (true);
drop policy if exists svc_all on support_tickets;
create policy svc_all on support_tickets for all to service_role using (true) with check (true);
drop policy if exists svc_all on support_ticket_replies;
create policy svc_all on support_ticket_replies for all to service_role using (true) with check (true);
drop policy if exists svc_all on broadcast_campaigns;
create policy svc_all on broadcast_campaigns for all to service_role using (true) with check (true);
drop policy if exists svc_all on broadcast_recipients;
create policy svc_all on broadcast_recipients for all to service_role using (true) with check (true);
drop policy if exists svc_all on lifecycle_emails;
create policy svc_all on lifecycle_emails for all to service_role using (true) with check (true);
drop policy if exists svc_all on subscription_promos;
create policy svc_all on subscription_promos for all to service_role using (true) with check (true);
drop policy if exists svc_all on payment_credentials;
create policy svc_all on payment_credentials for all to service_role using (true) with check (true);
drop policy if exists svc_all on device_logs;
create policy svc_all on device_logs for all to service_role using (true) with check (true);
drop policy if exists svc_all on storage_objects;
create policy svc_all on storage_objects for all to service_role using (true) with check (true);
drop policy if exists svc_all on storage_usage;
create policy svc_all on storage_usage for all to service_role using (true) with check (true);
drop policy if exists svc_all on subscription_intent_failures;
create policy svc_all on subscription_intent_failures for all to service_role using (true) with check (true);

-- ============================================================================
-- RPC privilege lock (migration 0065) — H1: semua fungsi aplikasi hanya dapat
-- dieksekusi service_role. Fungsi trigger (set_updated_at, tg_*) dilewati —
-- tidak pernah dipanggil sebagai RPC. Signature persis agar tak salah overload.
-- ============================================================================

revoke execute on function pos_complete_payment(uuid, uuid, text, uuid, text, uuid, uuid, integer, integer, integer) from public, anon, authenticated;
grant execute on function pos_complete_payment(uuid, uuid, text, uuid, text, uuid, uuid, integer, integer, integer) to service_role;

revoke execute on function pos_decrement_stock(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function pos_decrement_stock(uuid, uuid, integer) to service_role;

revoke execute on function pos_create_order_with_items(uuid, uuid, uuid, uuid, text, integer, integer, integer, integer, text, boolean, jsonb) from public, anon, authenticated;
grant execute on function pos_create_order_with_items(uuid, uuid, uuid, uuid, text, integer, integer, integer, integer, text, boolean, jsonb) to service_role;

revoke execute on function pos_set_booth_enabled(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function pos_set_booth_enabled(uuid, uuid, boolean) to service_role;

revoke execute on function storage_account_add(uuid, text, text, bigint) from public, anon, authenticated;
grant execute on function storage_account_add(uuid, text, text, bigint) to service_role;

revoke execute on function storage_account_sub(uuid, text[]) from public, anon, authenticated;
grant execute on function storage_account_sub(uuid, text[]) to service_role;

revoke execute on function dashboard_tx_summary(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function dashboard_tx_summary(uuid, timestamptz, timestamptz) to service_role;

revoke execute on function dashboard_daily_revenue(uuid, timestamptz, timestamptz, text) from public, anon, authenticated;
grant execute on function dashboard_daily_revenue(uuid, timestamptz, timestamptz, text) to service_role;

revoke execute on function finance_expense_summary(uuid, date, date) from public, anon, authenticated;
grant execute on function finance_expense_summary(uuid, date, date) to service_role;

revoke execute on function revenue_breakdown(uuid, timestamptz, timestamptz, text) from public, anon, authenticated;
grant execute on function revenue_breakdown(uuid, timestamptz, timestamptz, text) to service_role;

revoke execute on function tx_insights_summary(uuid, timestamptz, timestamptz, text) from public, anon, authenticated;
grant execute on function tx_insights_summary(uuid, timestamptz, timestamptz, text) to service_role;

revoke execute on function metrics_tx_status(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function metrics_tx_status(uuid, timestamptz, timestamptz) to service_role;

revoke execute on function metrics_returning_customers(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function metrics_returning_customers(uuid, timestamptz, timestamptz) to service_role;

revoke execute on function metrics_revenue_per_booth(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function metrics_revenue_per_booth(uuid, timestamptz, timestamptz) to service_role;

revoke execute on function metrics_sessions_per_booth(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function metrics_sessions_per_booth(uuid, timestamptz, timestamptz) to service_role;

revoke execute on function metrics_session_summary(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function metrics_session_summary(uuid, timestamptz, timestamptz) to service_role;

revoke execute on function metrics_popular_package(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function metrics_popular_package(uuid, timestamptz, timestamptz) to service_role;

revoke execute on function metrics_popular_template(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function metrics_popular_template(uuid, timestamptz, timestamptz) to service_role;

revoke execute on function staff_directory_today(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function staff_directory_today(uuid, timestamptz, timestamptz) to service_role;

revoke execute on function customer_spending(uuid, uuid[]) from public, anon, authenticated;
grant execute on function customer_spending(uuid, uuid[]) to service_role;

revoke execute on function operational_metrics(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function operational_metrics(uuid, timestamptz, timestamptz) to service_role;

-- ============================================================================
-- 9. Performance indexes (0067) — query terpanas: customer-session, rentang tx
-- global, pencarian teks trigram, list POS per business.
-- ============================================================================

create index if not exists idx_sessions_customer on sessions (business_id, customer_id);
create index if not exists idx_tx_created_at on transactions (created_at);
create index if not exists idx_tx_paid_at on transactions (paid_at) where status = 'paid';
create index if not exists idx_customers_name_trgm on customers using gin (name gin_trgm_ops);
create index if not exists idx_audit_action_trgm on audit_logs using gin (action gin_trgm_ops);
create index if not exists idx_pos_products_name_trgm on pos_products using gin (name gin_trgm_ops);
create index if not exists idx_pos_orders_business_created on pos_orders (business_id, created_at);

-- ============================================================================
-- 10. Kuota resource atomik (0069) — cegah race count-then-insert pada
-- outlet/photobox/member. Advisory transaction lock per (business, jenis).
-- ============================================================================

create or replace function create_outlet_with_quota(
  p_business_id uuid,
  p_max_outlets integer,
  p_name text,
  p_address text,
  p_city text,
  p_province text,
  p_status text
) returns outlets
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
  v_row outlets;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text || ':outlets', 0));

  select count(*) into v_count from outlets where business_id = p_business_id;
  if v_count >= p_max_outlets then
    raise exception 'PLAN_LIMIT_REACHED' using errcode = 'P0001';
  end if;

  insert into outlets (business_id, name, address, city, province, status)
  values (p_business_id, p_name, p_address, p_city, p_province, coalesce(p_status, 'active'))
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function create_photobox_with_quota(
  p_business_id uuid,
  p_max_photoboxes integer,
  p_payload jsonb
) returns photoboxes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
  v_row photoboxes;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text || ':photoboxes', 0));

  select count(*) into v_count from photoboxes where business_id = p_business_id;
  if v_count >= p_max_photoboxes then
    raise exception 'PLAN_LIMIT_REACHED' using errcode = 'P0001';
  end if;

  insert into photoboxes (
    business_id, outlet_id, slug, name, status, camera, printer, display,
    camera_settings, print_settings, session_settings, exit_pin_hash, payment_mode
  ) values (
    p_business_id,
    (p_payload->>'outlet_id')::uuid,
    p_payload->>'slug',
    p_payload->>'name',
    coalesce(p_payload->>'status', 'offline'),
    p_payload->>'camera',
    p_payload->>'printer',
    p_payload->>'display',
    p_payload->'camera_settings',
    p_payload->'print_settings',
    p_payload->'session_settings',
    p_payload->>'exit_pin_hash',
    p_payload->>'payment_mode'
  )
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function add_business_member_with_quota(
  p_business_id uuid,
  p_max_staff integer,
  p_user_id uuid,
  p_role text
) returns business_members
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
  v_row business_members;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text || ':members', 0));

  -- Owner tidak dihitung: plan dapat memakai max_staff = 0 dan owner tetap ada.
  select count(*) into v_count
    from business_members
   where business_id = p_business_id
     and role in ('manager', 'staff');

  if v_count >= p_max_staff then
    raise exception 'PLAN_LIMIT_REACHED' using errcode = 'P0001';
  end if;

  insert into business_members (business_id, user_id, role)
  values (p_business_id, p_user_id, coalesce(p_role, 'staff'))
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function create_outlet_with_quota(uuid, integer, text, text, text, text, text) from public, anon, authenticated;
grant execute on function create_outlet_with_quota(uuid, integer, text, text, text, text, text) to service_role;

revoke execute on function create_photobox_with_quota(uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function create_photobox_with_quota(uuid, integer, jsonb) to service_role;

revoke execute on function add_business_member_with_quota(uuid, integer, uuid, text) from public, anon, authenticated;
grant execute on function add_business_member_with_quota(uuid, integer, uuid, text) to service_role;

-- ============================================================================
-- 11. Pin search_path RPC (0071) — defense-in-depth.
-- 0065 men-lock EXECUTE ke service_role; ini memastikan resolusi nama di dalam
-- body tidak bergeser bila search_path role/sesi berubah. Daftar lengkap +
-- post-check ada di db/migrations/0071_rpc_search_path_hardening.sql.
-- ============================================================================

-- bootstrap_admin (0052) mendefinisikan `set search_path = public` inline tanpa
-- pg_temp; di sini ditambahkan (lihat juga komentar di migrasi 0071).
alter function bootstrap_admin(text) set search_path = public, pg_temp;

alter function activate_device_atomically(text, text) set search_path = public, pg_temp;
alter function pos_complete_payment(uuid, uuid, text, uuid, text, uuid, uuid, integer, integer, integer) set search_path = public, pg_temp;
alter function pos_decrement_stock(uuid, uuid, integer) set search_path = public, pg_temp;
alter function settle_paid_payment_atomically(uuid, text, text) set search_path = public, pg_temp;
alter function create_voucher_payment_atomically(uuid, uuid, text, text, text, text) set search_path = public, pg_temp;
alter function exit_pin_register_failure(uuid, integer, bigint) set search_path = public, pg_temp;

alter function dashboard_tx_summary(uuid, timestamptz, timestamptz) set search_path = public, pg_temp;
alter function dashboard_daily_revenue(uuid, timestamptz, timestamptz, text) set search_path = public, pg_temp;
alter function finance_expense_summary(uuid, date, date) set search_path = public, pg_temp;
alter function revenue_breakdown(uuid, timestamptz, timestamptz, text) set search_path = public, pg_temp;
alter function tx_insights_summary(uuid, timestamptz, timestamptz, text) set search_path = public, pg_temp;
alter function metrics_tx_status(uuid, timestamptz, timestamptz) set search_path = public, pg_temp;
alter function metrics_returning_customers(uuid, timestamptz, timestamptz) set search_path = public, pg_temp;
alter function metrics_revenue_per_booth(uuid, timestamptz, timestamptz) set search_path = public, pg_temp;
alter function metrics_sessions_per_booth(uuid, timestamptz, timestamptz) set search_path = public, pg_temp;
alter function metrics_session_summary(uuid, timestamptz, timestamptz) set search_path = public, pg_temp;
alter function metrics_popular_package(uuid, timestamptz, timestamptz) set search_path = public, pg_temp;
alter function metrics_popular_template(uuid, timestamptz, timestamptz) set search_path = public, pg_temp;
alter function staff_directory_today(uuid, timestamptz, timestamptz) set search_path = public, pg_temp;
alter function customer_spending(uuid, uuid[]) set search_path = public, pg_temp;
alter function operational_metrics(uuid, timestamptz, timestamptz) set search_path = public, pg_temp;

alter function storage_account_add(uuid, text, text, bigint) set search_path = public, pg_temp;
alter function storage_account_sub(uuid, text[]) set search_path = public, pg_temp;
