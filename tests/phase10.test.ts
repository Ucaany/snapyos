/**
 * Phase 10 unit checks — subscription math (docs/02 billing, docs/12 Phase 10).
 * Run: npm test
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  PERIOD_DAYS,
  effectiveSessions,
  invoiceNumber,
  nextPeriod,
  planChangeAllowed,
  usagePercent,
} from "../src/lib/subscription-math.ts";

test("nextPeriod: start = now, end = now + 30 hari", () => {
  const now = new Date("2026-08-19T00:00:00.000Z");
  const p = nextPeriod(now);
  assert.equal(p.start.getTime(), now.getTime());
  assert.equal(p.end.getTime(), now.getTime() + 30 * 86_400_000);
  assert.equal(PERIOD_DAYS, 30);
});

test("nextPeriod: cycle custom + guard input tidak valid", () => {
  const now = new Date(0);
  assert.equal(nextPeriod(now, 7).end.getTime(), 7 * 86_400_000);
  assert.throws(() => nextPeriod(now, 0));
  assert.throws(() => nextPeriod(now, 1.5));
  assert.throws(() => nextPeriod(new Date(NaN)));
});

test("invoiceNumber: INV-YYYYMM-#### unik per seq (UTC)", () => {
  const at = new Date("2026-08-19T23:00:00.000Z");
  assert.equal(invoiceNumber(1, at), "INV-202608-0001");
  assert.equal(invoiceNumber(42, at), "INV-202608-0042");
  assert.equal(invoiceNumber(9999, new Date("2027-01-01T00:00:00.000Z")), "INV-202701-9999");
  assert.notEqual(invoiceNumber(2, at), invoiceNumber(3, at));
  assert.throws(() => invoiceNumber(0, at));
  assert.throws(() => invoiceNumber(1.5, at));
});

test("usagePercent: 0–100, dibulatkan, max tidak sehat → 100", () => {
  assert.equal(usagePercent(0, 4), 0);
  assert.equal(usagePercent(1, 4), 25);
  assert.equal(usagePercent(2, 3), 67);
  assert.equal(usagePercent(3, 3), 100);
  assert.equal(usagePercent(9, 3), 100);
  assert.equal(usagePercent(2, 0), 100);
  assert.equal(usagePercent(-1, 3), 0);
  assert.equal(usagePercent(NaN, 3), 0);
});

test("planChangeAllowed: beda plan + aktif saja", () => {
  assert.equal(planChangeAllowed("starter", "growth", true), true);
  assert.equal(planChangeAllowed(null, "starter", true), true);
  assert.equal(planChangeAllowed("growth", "growth", true), false);
  assert.equal(planChangeAllowed("starter", "growth", false), false);
});

test("effectiveSessions: plan + sum add-on aktif (docs/02 §2.9)", () => {
  assert.equal(effectiveSessions(1, []), 1);
  assert.equal(effectiveSessions(1, [1]), 2);
  assert.equal(effectiveSessions(3, [2, 1]), 6);
  assert.equal(effectiveSessions(3, [0, -2, 1.5]), 3); // qty tidak sehat diabaikan
  assert.equal(effectiveSessions(-1, [2]), 0);
  assert.equal(effectiveSessions(NaN, [2]), 0);
});
