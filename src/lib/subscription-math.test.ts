import assert from "node:assert/strict";
import { test } from "node:test";

import {
  addOnPriceForCycle,
  cycleDays,
  cyclePeriod,
  isSubscriptionEffective,
  monthlyEquivalent,
  normalizeCycle,
  pastDueGraceDays,
} from "./subscription-math.ts";

const DAY = 86_400_000;

void test("cycleDays memetakan 4 siklus; nilai tak dikenal → monthly", () => {
  assert.equal(cycleDays("daily"), 1);
  assert.equal(cycleDays("weekly"), 7);
  assert.equal(cycleDays("monthly"), 30);
  assert.equal(cycleDays("yearly"), 365);
  assert.equal(cycleDays("weekend"), 30);
  assert.equal(normalizeCycle(null), "monthly");
});

void test("cyclePeriod memakai panjang periode siklus", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  assert.equal(cyclePeriod(now, "daily").end.getTime() - now.getTime(), DAY);
  assert.equal(cyclePeriod(now, "weekly").end.getTime() - now.getTime(), 7 * DAY);
  assert.equal(cyclePeriod(now, "monthly").end.getTime() - now.getTime(), 30 * DAY);
  assert.equal(cyclePeriod(now, "yearly").end.getTime() - now.getTime(), 365 * DAY);
});

void test("addOnPriceForCycle memilih kolom siklus; null = tidak dijual", () => {
  const prices = {
    price_daily: 10_000,
    price_weekly: null,
    price_monthly: 49_000,
    price_yearly: null,
  };
  assert.equal(addOnPriceForCycle(prices, "daily"), 10_000);
  assert.equal(addOnPriceForCycle(prices, "weekly"), null);
  assert.equal(addOnPriceForCycle(prices, "monthly"), 49_000);
  assert.equal(addOnPriceForCycle(prices, "yearly"), null);
});

void test("monthlyEquivalent menormalkan harga per siklus ke 30 hari", () => {
  assert.equal(monthlyEquivalent(1_000, "daily"), 30_000);
  assert.equal(monthlyEquivalent(7_000, "weekly"), 30_000);
  assert.equal(monthlyEquivalent(30_000, "monthly"), 30_000);
  assert.equal(monthlyEquivalent(365_000, "yearly"), 30_000);
});

void test("grace past_due = min(7 hari, panjang periode)", () => {
  assert.equal(pastDueGraceDays("daily"), 1);
  assert.equal(pastDueGraceDays("weekly"), 7);
  assert.equal(pastDueGraceDays("monthly"), 7);
  assert.equal(pastDueGraceDays("yearly"), 7);
});

void test("isSubscriptionEffective menghormati grace siklus harian", () => {
  const now = new Date("2026-01-10T00:00:00Z");
  const recent = new Date(now.getTime() - 12 * 3_600_000).toISOString();
  const old = new Date(now.getTime() - 2 * DAY).toISOString();
  assert.equal(isSubscriptionEffective("past_due", null, recent, now, "daily"), true);
  assert.equal(isSubscriptionEffective("past_due", null, old, now, "daily"), false);
  assert.equal(isSubscriptionEffective("past_due", null, old, now, "monthly"), true);
  assert.equal(
    isSubscriptionEffective(
      "past_due",
      null,
      new Date(now.getTime() - 8 * DAY).toISOString(),
      now,
      "monthly"
    ),
    false
  );
});
