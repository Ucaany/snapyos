-- 0041 — subscription_intent_failures: dedicated manual-review queue for
-- silent activation failures on paid subscription invoices.
--
-- Context (BUG): applyInvoiceIntent(businessId, invoiceId) at
-- src/server/subscription.ts atomically claims intent.applied=true, then
-- may hit a non-error early-return path when the target subscription is
-- no longer in {trial, active, past_due} (owner cancelled → cron flipped
-- to cancelled → late webhook paid arrives). Previously the fn returned
-- silently: money settled on the invoice, plan/add-on never activated,
-- claim locked, no audit, no retry path. Root cause of "invoice paid but
-- nothing happened" support tickets.
--
-- Fix (paired with server refactor + admin UI):
--   1. Release claim (intent.applied=false, applied_at=null) on every
--      non-success early-return in applyInvoiceIntent.
--   2. Insert audit_logs row (action=subscription.intent_activation_failed).
--   3. Insert row in this table so admin can refund or manually activate.
--
-- The invoice row itself keeps status='paid' and money stays in the
-- provider account until an admin resolves the review (refund vs
-- activate). No automatic refund is issued — a human decision is
-- required per case (owner may want manual activation on a fresh
-- subscription, or a Pakasir refund).
--
-- Rollback: 0041_subscription_intent_failures_rollback.sql.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Table
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists subscription_intent_failures (
  id uuid primary key default gen_random_uuid(),

  -- What failed.
  business_id uuid not null references businesses (id) on delete cascade,
  invoice_id uuid not null references invoices (id) on delete cascade,
  subscription_id uuid references subscriptions (id) on delete set null,

  -- Why (machine reason). Free-form text so we can add reasons without
  -- migrations; keep the set small and documented in
  -- src/server/subscription.ts (INTENT_FAILURE_REASON).
  --
  -- Known values (2026-09):
  --   SUBSCRIPTION_NOT_ACTIVE  — subscription row not in {trial,active,past_due}
  --                              at the moment plan activation ran (owner
  --                              cancelled + cron transitioned before webhook).
  --   UPDATE_NO_ROW            — subscriptions UPDATE ... .in([...]).select()
  --                              returned null (race with cron/admin flipping
  --                              status between SELECT and UPDATE).
  --   MISSING_SUBSCRIPTION_ID  — invoice has no subscription_id but items
  --                              contain add-ons that require one.
  --   INTENT_EXCEPTION         — unexpected error during activation
  --                              (claim was already released by the try/catch,
  --                              this row records the failure for review).
  reason text not null,

  -- Human-readable message (optional; ASCII-only for logs).
  message text,

  -- Snapshot of intent + amount at failure time — invaluable for
  -- post-mortem because the invoice.intent may be replayed/mutated later.
  intent_snapshot jsonb not null,
  amount integer not null check (amount >= 0),

  -- Review state machine. Admin actions:
  --   pending     → default
  --   activated   → admin manually activated plan/add-on and closed case
  --   refunded    → admin refunded the payment out-of-band and closed case
  --   dismissed   → false alarm / duplicate / superseded by retry
  status text not null default 'pending'
    check (status in ('pending', 'activated', 'refunded', 'dismissed')),

  resolved_by uuid references users (id) on delete set null,
  resolved_at timestamptz,
  resolution_note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One open review per (invoice, reason) — retries that trip the same
-- reason won't spam the queue. Different reasons → different rows
-- (they are genuinely different failure modes).
create unique index if not exists idx_intent_failures_open
  on subscription_intent_failures (invoice_id, reason)
  where status = 'pending';

create index if not exists idx_intent_failures_business
  on subscription_intent_failures (business_id, created_at desc);

create index if not exists idx_intent_failures_status
  on subscription_intent_failures (status, created_at desc);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. RLS
-- ═══════════════════════════════════════════════════════════════════════════
--
-- This is an admin-only queue. Business owners see it via the standard
-- audit log entry (subscription.intent_activation_failed). We keep RLS
-- disabled here because the app already gates all access through
-- src/server/admin/subscription-failures.ts (requireAdmin) and the
-- webhook writer runs with the service-role client. No RLS = no
-- accidental owner-side leakage since no non-admin server code queries
-- this table.

alter table subscription_intent_failures enable row level security;

-- Allow service role full access (webhook writer + admin server actions).
create policy "svc_all" on subscription_intent_failures
  for all
  to service_role
  using (true)
  with check (true);

-- No policy for authenticated users → deny by default.

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. updated_at trigger
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function tg_subscription_intent_failures_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_intent_failures_touch on subscription_intent_failures;
create trigger trg_intent_failures_touch
  before update on subscription_intent_failures
  for each row execute function tg_subscription_intent_failures_touch();

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Comments (self-documenting for pgAdmin/psql \d+)
-- ═══════════════════════════════════════════════════════════════════════════

comment on table subscription_intent_failures is
  'Manual-review queue for silent activation failures on paid subscription invoices. Written by applyInvoiceIntent when it hits a non-success early-return. Resolved by admin at /admin/subscriptions/pending-review (activate manually or refund).';
comment on column subscription_intent_failures.reason is
  'Machine reason: SUBSCRIPTION_NOT_ACTIVE | UPDATE_NO_ROW | MISSING_SUBSCRIPTION_ID | INTENT_EXCEPTION.';
comment on column subscription_intent_failures.intent_snapshot is
  'Snapshot of invoices.intent at failure time (post-rollback of applied=false). Used by admin UI to display what would have been activated.';
