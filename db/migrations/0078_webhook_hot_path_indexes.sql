-- 0078: webhook hot-path indexes.
--
-- Bug #6: payment_webhooks hanya di-index pada payment_id.
-- Webhook handler sering query berdasarkan:
--   1. status + received_at (admin dashboard, retry cron)
--   2. provider + status (provider-specific monitoring)
--   3. event_id (idempotency check — sudah UNIQUE, tapi eksplisit partial
--      index untuk status lookup)
-- Tambahan: payments.status + created_at untuk payment monitoring dashboard.

begin;

-- Webhook status monitoring & retry cron
create index if not exists idx_payment_webhooks_status_received
  on payment_webhooks (status, received_at desc);

-- Provider-specific webhook monitoring
create index if not exists idx_payment_webhooks_provider_status
  on payment_webhooks (provider, status);

-- Payment status + created_at untuk dashboard & reporting hot-path
create index if not exists idx_payments_status_created
  on payments (status, created_at desc);

commit;
