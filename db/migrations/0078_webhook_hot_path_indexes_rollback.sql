begin;
drop index if exists idx_payment_webhooks_status_received;
drop index if exists idx_payment_webhooks_provider_status;
drop index if exists idx_payments_status_created;
commit;
