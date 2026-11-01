-- ============================================================================
-- 0027 ROLLBACK: Revert Direct Merchant Payment + Device Config
-- ============================================================================

-- Device logs
drop table if exists device_logs;

-- Payments: remove credential_id
alter table payments drop column if exists credential_id;

-- Transactions: revert payment_method constraint to pre-0027
alter table transactions drop constraint if exists transactions_payment_method_check;
alter table transactions add constraint transactions_payment_method_check
  check (payment_method in ('qris', 'cash', 'bank_transfer', 'other', 'offline'));

-- Devices: remove Electron columns
alter table devices drop column if exists operator_connected_at;
alter table devices drop column if exists operator_user_id;
alter table devices drop column if exists diagnostics;
alter table devices drop column if exists last_heartbeat_at;
alter table devices drop column if exists kiosk_locked;
alter table devices drop column if exists printer_config;
alter table devices drop column if exists camera_config;
alter table devices drop column if exists display_style;
alter table devices drop column if exists display_orientation;
alter table devices drop column if exists os_info;

-- Payment credentials
drop trigger if exists trg_payment_credentials_updated_at on payment_credentials;
drop table if exists payment_credentials;
