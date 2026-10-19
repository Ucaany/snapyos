-- Rollback 0025: remove cancel_at_period_end from subscription_add_ons
alter table subscription_add_ons drop column if exists cancel_at_period_end;
