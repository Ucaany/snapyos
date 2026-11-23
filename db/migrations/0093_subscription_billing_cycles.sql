-- 0093 — Subscription billing cycles: daily / weekly / monthly / yearly.
-- Plans carry ONE price per billing cycle. Subscriptions snapshot the cycle so
-- admin edits to a plan never rewrite a paid period. Add-ons gain a price per
-- cycle (NULL = not sold for that cycle).

-- ---------------------------------------------------------------------------
-- plans
-- ---------------------------------------------------------------------------
alter table plans rename column price_monthly to price;
alter table plans drop column price_yearly;

alter table plans drop constraint if exists plans_billing_cycle_check;
alter table plans add constraint plans_billing_cycle_check
  check (billing_cycle in ('daily', 'weekly', 'monthly', 'yearly'));

alter table plans add constraint plans_price_check check (price >= 0);

-- ---------------------------------------------------------------------------
-- subscriptions — snapshot siklus saat aktivasi
-- ---------------------------------------------------------------------------
alter table subscriptions add column billing_cycle text not null default 'monthly';
alter table subscriptions add constraint subscriptions_billing_cycle_check
  check (billing_cycle in ('daily', 'weekly', 'monthly', 'yearly'));

-- Backfill dari plan saat ini; nilai plan lama hanya monthly/yearly.
update subscriptions s
set billing_cycle = p.billing_cycle
from plans p
where p.id = s.plan_id;

-- ---------------------------------------------------------------------------
-- add_ons — harga per siklus (NULL = add-on tidak dijual untuk siklus itu)
-- ---------------------------------------------------------------------------
alter table add_ons add column price_daily integer
  check (price_daily is null or price_daily >= 0);
alter table add_ons add column price_weekly integer
  check (price_weekly is null or price_weekly >= 0);
alter table add_ons add column price_yearly integer
  check (price_yearly is null or price_yearly >= 0);
