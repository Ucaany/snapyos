-- Rollback 0093 — kembali ke model monthly/yearly.
-- CATATAN: harga harian/mingguan dan snapshot billing_cycle subscription
-- hilang. Plan daily/weekly dinormalisasi menjadi monthly agar check lama valid.

alter table subscriptions drop constraint if exists subscriptions_billing_cycle_check;
alter table subscriptions drop column billing_cycle;

alter table add_ons drop column price_daily;
alter table add_ons drop column price_weekly;
alter table add_ons drop column price_yearly;

alter table plans drop constraint if exists plans_price_check;
alter table plans drop constraint if exists plans_billing_cycle_check;

update plans set billing_cycle = 'monthly' where billing_cycle in ('daily', 'weekly');

alter table plans add constraint plans_billing_cycle_check
  check (billing_cycle in ('monthly', 'yearly'));

alter table plans rename column price to price_monthly;
alter table plans add column price_yearly integer check (price_yearly >= 0);
