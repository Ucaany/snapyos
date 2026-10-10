/**
 * Subscription lifecycle enforcement — docs/02 §2.4.
 * Tests for isSubscriptionEffective() pure function.
 * Run: npm test
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  isSubscriptionEffective,
  PAST_DUE_GRACE_DAYS,
} from "../src/lib/subscription-math.ts";

const DAY = 86_400_000;

// ---------------------------------------------------------------------------
// trial
// ---------------------------------------------------------------------------
test("trial + future trial_ends_at → effective", () => {
  const now = new Date("2026-09-01T12:00:00Z");
  assert.ok(
    isSubscriptionEffective("trial", "2026-09-15T12:00:00Z", null, now)
  );
});

test("trial + trial_ends_at = now (boundary inclusive) → effective", () => {
  const now = new Date("2026-09-15T12:00:00Z");
  assert.ok(
    isSubscriptionEffective("trial", "2026-09-15T12:00:00Z", null, now)
  );
});

test("trial + trial_ends_at 1ms past → NOT effective", () => {
  const endsAt = "2026-09-15T12:00:00Z";
  const now = new Date(new Date(endsAt).getTime() + 1);
  assert.ok(!isSubscriptionEffective("trial", endsAt, null, now));
});

test("trial + null trial_ends_at → NOT effective", () => {
  assert.ok(
    !isSubscriptionEffective("trial", null, null, new Date("2026-09-01T00:00:00Z"))
  );
});

// ---------------------------------------------------------------------------
// active
// ---------------------------------------------------------------------------
test("active + future period_end → effective", () => {
  const now = new Date("2026-09-01T12:00:00Z");
  assert.ok(
    isSubscriptionEffective("active", null, "2026-10-01T12:00:00Z", now)
  );
});

test("active + period_end = now (boundary) → effective", () => {
  const now = new Date("2026-10-01T12:00:00Z");
  assert.ok(
    isSubscriptionEffective("active", null, "2026-10-01T12:00:00Z", now)
  );
});

test("active + period_end past → NOT effective", () => {
  const now = new Date("2026-10-02T12:00:00Z");
  assert.ok(
    !isSubscriptionEffective("active", null, "2026-10-01T12:00:00Z", now)
  );
});

test("active + null period_end (legacy) → NOT effective (fail-closed)", () => {
  assert.ok(
    !isSubscriptionEffective("active", null, null, new Date("2026-09-01T00:00:00Z"))
  );
});

// ---------------------------------------------------------------------------
// past_due
// ---------------------------------------------------------------------------
test("past_due + within grace → effective", () => {
  const periodEnd = "2026-09-01T00:00:00Z";
  // 3 days into grace (grace = 7)
  const now = new Date(new Date(periodEnd).getTime() + 3 * DAY);
  assert.ok(isSubscriptionEffective("past_due", null, periodEnd, now));
});

test("past_due + grace boundary (exactly grace days) → effective", () => {
  const periodEnd = "2026-09-01T00:00:00Z";
  const now = new Date(
    new Date(periodEnd).getTime() + PAST_DUE_GRACE_DAYS * DAY
  );
  assert.ok(isSubscriptionEffective("past_due", null, periodEnd, now));
});

test("past_due + grace exceeded → NOT effective", () => {
  const periodEnd = "2026-09-01T00:00:00Z";
  const now = new Date(
    new Date(periodEnd).getTime() + PAST_DUE_GRACE_DAYS * DAY + 1
  );
  assert.ok(!isSubscriptionEffective("past_due", null, periodEnd, now));
});

test("past_due + null period_end → NOT effective", () => {
  assert.ok(
    !isSubscriptionEffective("past_due", null, null, new Date("2026-09-01T00:00:00Z"))
  );
});

// ---------------------------------------------------------------------------
// terminal statuses
// ---------------------------------------------------------------------------
test("cancelled → NOT effective regardless of dates", () => {
  assert.ok(
    !isSubscriptionEffective("cancelled", "2099-01-01T00:00:00Z", "2099-01-01T00:00:00Z")
  );
});

test("expired → NOT effective regardless of dates", () => {
  assert.ok(
    !isSubscriptionEffective("expired", "2099-01-01T00:00:00Z", "2099-01-01T00:00:00Z")
  );
});

// ---------------------------------------------------------------------------
// edge: unknown status
// ---------------------------------------------------------------------------
test("unknown status → NOT effective", () => {
  assert.ok(
    !isSubscriptionEffective("bogus", "2099-01-01T00:00:00Z", "2099-01-01T00:00:00Z")
  );
});

// ---------------------------------------------------------------------------
// PAST_DUE_GRACE_DAYS constant
// ---------------------------------------------------------------------------
test("PAST_DUE_GRACE_DAYS = 7", () => {
  assert.equal(PAST_DUE_GRACE_DAYS, 7);
});

// ---------------------------------------------------------------------------
// NaN date
// ---------------------------------------------------------------------------
test("NaN now → NOT effective", () => {
  assert.ok(
    !isSubscriptionEffective("active", null, "2099-01-01T00:00:00Z", new Date(NaN))
  );
});
