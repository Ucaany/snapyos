-- 0049_template_purchases.sql
-- Pembelian template premium (global) oleh owner — docs/15 §15.9b (fitur
-- template jualan). Owner membeli template global premium (templates.is_premium
-- = true, business_id NULL) via invoice QRIS Pakasir; saat paid, baris
-- kepemilikan ditulis ke `business_template_purchases` sehingga template
-- tersebut tampil & bisa dipakai tenant (listPublicTemplates + builder).
--
-- Additive-only. Rollback: 0049_template_purchases_rollback.sql.

create table if not exists business_template_purchases (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  template_id uuid not null references templates (id) on delete cascade,
  invoice_id uuid references invoices (id) on delete set null,
  price integer not null check (price >= 0),
  purchased_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  -- Satu business hanya bisa membeli template tertentu sekali (idempotent).
  unique (business_id, template_id)
);
create index if not exists idx_btp_business on business_template_purchases (business_id, created_at);
create index if not exists idx_btp_template on business_template_purchases (template_id);
