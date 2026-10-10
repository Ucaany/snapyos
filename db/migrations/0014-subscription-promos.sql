-- 0014: promo code untuk pembayaran invoice subscription platform (docs/02 §2.5).
-- Dipakai di layar konfirmasi plan + add-on (sebelum harga fix). Diskon integer IDR.
-- Dikelola platform (admin) — dipakai via code, divalidasi server-side.

create table if not exists subscription_promos (
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
create index if not exists idx_subscription_promos_active on subscription_promos (is_active, code);
