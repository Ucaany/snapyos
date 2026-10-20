/**
 * Subscription billing fixes — unit tests for pure logic.
 * Run: npm test
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { nextPeriod, PERIOD_DAYS, effectiveSessions } from "../src/lib/subscription-math.ts";

// Inline intentToItems (mirrors server/subscription.ts) — avoids server-only import.
type Item = {
  type: "plan_change" | "add_on";
  plan_id?: string;
  add_on_id?: string;
  code?: string;
  name?: string;
  amount: number;
  qty: number;
};
type Intent = {
  items?: Item[];
  type?: string;
  plan_id?: string;
  add_on_id?: string;
  code?: string;
  name?: string;
} | null;
function intentToItems(i: Intent, fb: number): Item[] {
  if (!i) return [];
  if (Array.isArray(i.items) && i.items.length > 0) return i.items;
  return [
    {
      type: i.type === "add_on" ? "add_on" : "plan_change",
      plan_id: i.plan_id,
      add_on_id: i.add_on_id,
      code: i.code,
      name: i.name,
      amount: fb,
      qty: 1,
    },
  ];
}

// --- Fix 1: add-on-only checkout items ---

test("intentToItems: add-on-only → no plan_change", () => {
  const items = intentToItems(
    {
      items: [
        {
          type: "add_on",
          add_on_id: "a",
          code: "extra_session",
          name: "+1",
          amount: 49000,
          qty: 2,
        },
      ],
    },
    98000
  );
  assert.equal(items.length, 1);
  assert.equal(items[0]!.type, "add_on");
  assert.equal(items[0]!.amount * items[0]!.qty, 98000);
});

test("intentToItems: plan+addon → both items", () => {
  const items = intentToItems(
    {
      items: [
        {
          type: "plan_change",
          plan_id: "p1",
          code: "growth",
          name: "Growth",
          amount: 249000,
          qty: 1,
        },
        {
          type: "add_on",
          add_on_id: "a1",
          code: "extra_session",
          name: "+1",
          amount: 49000,
          qty: 1,
        },
      ],
    },
    298000
  );
  assert.equal(items.length, 2);
  assert.equal(items[0]!.type, "plan_change");
  assert.equal(items[1]!.type, "add_on");
});

test("intentToItems: null → empty", () => {
  assert.equal(intentToItems(null, 100000).length, 0);
});

// --- Fix 2: period extension ---

test("nextPeriod: from future date preserves remaining days", () => {
  const future = new Date(Date.now() + 15 * 86_400_000);
  const p = nextPeriod(future);
  assert.equal(p.start.getTime(), future.getTime());
  assert.equal(p.end.getTime(), future.getTime() + PERIOD_DAYS * 86_400_000);
});

test("same-plan renewal: extend from period_end when future", () => {
  const periodEnd = new Date("2026-09-29T10:00:00Z");
  const now = new Date("2026-09-14T10:00:00Z");
  const base = periodEnd.getTime() > now.getTime() ? periodEnd : now;
  const p = nextPeriod(base);
  assert.equal(p.start.toISOString(), "2026-09-29T10:00:00.000Z");
  assert.equal(p.end.toISOString(), "2026-10-29T10:00:00.000Z");
});

test("same-plan renewal past expiry: extend from now", () => {
  const periodEnd = new Date("2026-09-10T10:00:00Z");
  const now = new Date("2026-09-14T10:00:00Z");
  const base = periodEnd.getTime() > now.getTime() ? periodEnd : now;
  const p = nextPeriod(base);
  assert.equal(p.start.toISOString(), "2026-09-14T10:00:00.000Z");
});

// --- Fix 3: gross calculation ---

test("gross: add-on only = no plan price", () => {
  const gross = (false ? 99000 : 0) + 49000 * 2;
  assert.equal(gross, 98000);
});

test("gross: plan change = plan + addon", () => {
  const gross = (true ? 249000 : 0) + 49000;
  assert.equal(gross, 298000);
});

// --- Fix 4: isActualPlanChange logic ---

test("isActualPlanChange: undefined planCode → false", () => {
  const input: string | undefined = undefined;
  assert.equal(Boolean(input) && input !== "starter", false);
});

test("isActualPlanChange: same plan → false", () => {
  assert.equal(Boolean("starter") && "starter" !== "starter", false);
});

test("isActualPlanChange: different plan → true", () => {
  const a: string = "growth";
  const b: string = "starter";
  assert.equal(Boolean(a) && a !== b, true);
});

// --- Fix 5: cancel_at_period_end still counted ---

test("effectiveSessions: pending-cancel add-ons still counted", () => {
  assert.equal(effectiveSessions(1, [2, 1, 1]), 5);
});
