-- ============================================================================
-- 0025: Subscription billing fixes — add-on end-of-period cancel
-- Bug: cancelAddOn() immediately sets status='cancelled', inconsistent
-- with plan cancel which uses cancel_at_period_end flag.
-- Fix: add cancel_at_period_end boolean to subscription_add_ons so
-- add-on cancellation is deferred to period end, matching plan behavior.
-- ============================================================================

alter table subscription_add_ons add column if not exists
  cancel_at_period_end boolean not null default false;
