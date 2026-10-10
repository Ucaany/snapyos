-- 0011: pembayaran invoice subscription via QRIS (Pakasir).
-- Terpisah dari `payments` (checkout kiosk — checkout_session_id not null).
-- Webhook Pakasir bercabang: order_id tidak ditemukan
-- di `payments` → dicari di `invoice_payments`.
-- Idempotent — aman dijalankan berulang / pada baseline schema baru.

create table if not exists invoice_payments (
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
    check (status in ('pending', 'paid', 'expired')),
  qr_string text,
  expires_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_invpay_business_status on invoice_payments (business_id, status);
create index if not exists idx_invpay_invoice on invoice_payments (invoice_id);

drop trigger if exists trg_invoice_payments_updated_at on invoice_payments;
create trigger trg_invoice_payments_updated_at before update on invoice_payments
  for each row execute function set_updated_at();
