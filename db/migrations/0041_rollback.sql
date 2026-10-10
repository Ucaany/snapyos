-- 0041 rollback — drop subscription_intent_failures.
--
-- Safe to run only if no pending rows exist that operators care about
-- (this deletes the entire manual-review queue). The referencing code
-- (src/server/subscription.ts INTENT_FAILURE_REASON, admin UI at
-- /admin/subscriptions/pending-review) must be reverted BEFORE running
-- this rollback, otherwise the app will crash on missing table.

drop trigger if exists trg_intent_failures_touch on subscription_intent_failures;
drop function if exists tg_subscription_intent_failures_touch();
drop table if exists subscription_intent_failures;
