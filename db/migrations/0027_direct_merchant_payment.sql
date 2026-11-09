-- ============================================================================
-- 0027: Direct Merchant Payment + Device Config
-- Prerequisite: schema.sql baseline OR migrations 0002..0026 applied.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Payment credentials per business (Direct Merchant Integration)
-- Owner memasukkan merchant_id + server_key dari gateway masing-masing.
-- server_key_encrypted: AES-256-GCM encrypted (app-layer, bukan pgcrypto).
-- ---------------------------------------------------------------------------
create table if not exists payment_credentials (
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
  webhook_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_credentials_unique_active
    unique (business_id, provider, environment)
);
create index if not exists idx_payment_creds_business
  on payment_credentials (business_id, is_active);

-- Trigger: updated_at (idempotent — function already exists from schema.sql)
do $$ begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'trg_payment_credentials_updated_at'
      and tgrelid = 'payment_credentials'::regclass
  ) then
    create trigger trg_payment_credentials_updated_at
      before update on payment_credentials
      for each row execute function set_updated_at();
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Extend devices: runtime config columns
-- ---------------------------------------------------------------------------
alter table devices add column if not exists os_info jsonb;
alter table devices add column if not exists display_orientation text
  default 'portrait' check (display_orientation in ('portrait', 'landscape'));
alter table devices add column if not exists display_style text
  default 'classic' check (display_style in ('classic', 'compact', 'receipt'));
alter table devices add column if not exists camera_config jsonb
  not null default '{}'::jsonb;
alter table devices add column if not exists printer_config jsonb
  not null default '{}'::jsonb;
alter table devices add column if not exists kiosk_locked boolean not null default false;
alter table devices add column if not exists last_heartbeat_at timestamptz;
alter table devices add column if not exists diagnostics jsonb
  not null default '{}'::jsonb;
alter table devices add column if not exists operator_user_id uuid
  references users (id) on delete set null;
alter table devices add column if not exists operator_connected_at timestamptz;

-- ---------------------------------------------------------------------------
-- Extend payment_method enum: tambah 'gateway' untuk direct merchant
-- ---------------------------------------------------------------------------
alter table transactions drop constraint if exists transactions_payment_method_check;
alter table transactions add constraint transactions_payment_method_check
  check (payment_method in ('qris', 'cash', 'bank_transfer', 'other', 'offline', 'gateway'));

-- ---------------------------------------------------------------------------
-- Extend payments: credential reference
-- ---------------------------------------------------------------------------
alter table payments add column if not exists credential_id uuid
  references payment_credentials (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Device logs (riwayat per device — auto-cleanup 30d via cron)
-- ---------------------------------------------------------------------------
create table if not exists device_logs (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references devices (id) on delete cascade,
  level text not null default 'info'
    check (level in ('debug', 'info', 'warn', 'error')),
  category text not null default 'system',
  message text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_device_logs_device_time
  on device_logs (device_id, created_at desc);
