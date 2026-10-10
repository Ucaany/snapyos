import assert from "node:assert/strict";
import { test } from "node:test";

import { isFeatureEnabled, type FeatureKey } from "../src/lib/feature-gate.ts";

// ---------- Starter plan features (dari seed db/schema.sql) ----------
const starterFeatures: Record<string, boolean> = {
  voucher: false,
  finance: false,
  reports: false,
  staff: false,
  qr_delivery: true,
  storage: true,
  cash_payment: false,
};

// ---------- Growth plan features ----------
const growthFeatures: Record<string, boolean> = {
  voucher: true,
  finance: true,
  reports: true,
  staff: false,
  qr_delivery: true,
  storage: true,
  cash_payment: true,
};

// ---------- Business plan features ----------
const businessFeatures: Record<string, boolean> = {
  voucher: true,
  finance: true,
  reports: true,
  staff: true,
  qr_delivery: true,
  storage: true,
  cash_payment: true,
};

// ---------- isFeatureEnabled — basic behavior ----------

test("isFeatureEnabled: null/undefined features → always false", () => {
  assert.equal(isFeatureEnabled(null, "voucher"), false);
  assert.equal(isFeatureEnabled(undefined, "voucher"), false);
});

test("isFeatureEnabled: empty object → false for any feature", () => {
  assert.equal(isFeatureEnabled({}, "voucher"), false);
  assert.equal(isFeatureEnabled({}, "finance"), false);
});

test("isFeatureEnabled: feature explicitly true → true", () => {
  assert.equal(isFeatureEnabled({ voucher: true }, "voucher"), true);
});

test("isFeatureEnabled: feature explicitly false → false", () => {
  assert.equal(isFeatureEnabled({ voucher: false }, "voucher"), false);
});

test("isFeatureEnabled: missing key → false (fail-closed)", () => {
  assert.equal(isFeatureEnabled({ voucher: true }, "finance"), false);
});

// ---------- Starter plan: most features disabled ----------

test("Starter plan: voucher disabled", () => {
  assert.equal(isFeatureEnabled(starterFeatures, "voucher"), false);
});

test("Starter plan: finance disabled", () => {
  assert.equal(isFeatureEnabled(starterFeatures, "finance"), false);
});

test("Starter plan: reports disabled", () => {
  assert.equal(isFeatureEnabled(starterFeatures, "reports"), false);
});

test("Starter plan: staff disabled", () => {
  assert.equal(isFeatureEnabled(starterFeatures, "staff"), false);
});

test("Starter plan: qr_delivery enabled", () => {
  assert.equal(isFeatureEnabled(starterFeatures, "qr_delivery" as FeatureKey), true);
});

// ---------- Growth plan: some features enabled ----------

test("Growth plan: voucher enabled", () => {
  assert.equal(isFeatureEnabled(growthFeatures, "voucher"), true);
});

test("Growth plan: finance enabled", () => {
  assert.equal(isFeatureEnabled(growthFeatures, "finance"), true);
});

test("Growth plan: reports enabled", () => {
  assert.equal(isFeatureEnabled(growthFeatures, "reports"), true);
});

test("Growth plan: staff disabled", () => {
  assert.equal(isFeatureEnabled(growthFeatures, "staff"), false);
});

// ---------- Business plan: all features enabled ----------

test("Business plan: all gated features enabled", () => {
  const keys: FeatureKey[] = [
    "voucher", "finance", "reports", "staff", "cash_payment",
  ];
  for (const key of keys) {
    assert.equal(isFeatureEnabled(businessFeatures, key), true, `${key} should be enabled`);
  }
});

// ---------- Edge: non-boolean values in jsonb ----------

test("isFeatureEnabled: non-boolean truthy value → false (strict boolean)", () => {
  // jsonb could theoretically have string/number; only boolean true counts
  assert.equal(isFeatureEnabled({ voucher: 1 } as unknown as Record<string, boolean>, "voucher"), false);
  assert.equal(isFeatureEnabled({ voucher: "true" } as unknown as Record<string, boolean>, "voucher"), false);
});

// ---------- Feature matrix Starter vs Growth vs Business ----------

test("Feature matrix: Starter < Growth < Business entitlements", () => {
  const gatedFeatures: FeatureKey[] = ["voucher", "finance", "reports", "cash_payment"];
  for (const key of gatedFeatures) {
    assert.equal(isFeatureEnabled(starterFeatures, key), false, `Starter should not have ${key}`);
    assert.equal(isFeatureEnabled(growthFeatures, key), true, `Growth should have ${key}`);
    assert.equal(isFeatureEnabled(businessFeatures, key), true, `Business should have ${key}`);
  }
  // staff only in Business
  assert.equal(isFeatureEnabled(starterFeatures, "staff"), false);
  assert.equal(isFeatureEnabled(growthFeatures, "staff"), false);
  assert.equal(isFeatureEnabled(businessFeatures, "staff"), true);
  // storage enabled across all plans (0054)
  assert.equal(isFeatureEnabled(starterFeatures, "storage"), true);
  assert.equal(isFeatureEnabled(growthFeatures, "storage"), true);
  assert.equal(isFeatureEnabled(businessFeatures, "storage"), true);
});
