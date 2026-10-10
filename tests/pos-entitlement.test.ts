import assert from "node:assert/strict";
import { test } from "node:test";

import { evaluatePosEntitlement } from "../src/lib/pos-entitlement.ts";

const posActive = { status: "active", addOnCode: "pos", addOnActive: true };

test("trial + add-on pos aktif → berhak", () => {
  assert.ok(evaluatePosEntitlement("trial", [posActive]));
});

test("active + add-on pos aktif → berhak", () => {
  assert.ok(evaluatePosEntitlement("active", [posActive]));
});

test("past_due + add-on pos aktif → berhak", () => {
  assert.ok(evaluatePosEntitlement("past_due", [posActive]));
});

test("add-on pos dibatalkan → tidak berhak", () => {
  assert.ok(!evaluatePosEntitlement("active", [{ ...posActive, status: "cancelled" }]));
});

test("add_ons dinonaktifkan (is_active=false) → tidak berhak", () => {
  assert.ok(!evaluatePosEntitlement("active", [{ ...posActive, addOnActive: false }]));
});

test("add-on lain (bukan pos) → tidak berhak", () => {
  assert.ok(!evaluatePosEntitlement("active", [{ ...posActive, addOnCode: "extra_session" }]));
});

test("tanpa subscription → tidak berhak", () => {
  assert.ok(!evaluatePosEntitlement(null, [posActive]));
  assert.ok(!evaluatePosEntitlement(undefined, [posActive]));
});

test("subscription expired/cancelled → tidak berhak", () => {
  assert.ok(!evaluatePosEntitlement("expired", [posActive]));
  assert.ok(!evaluatePosEntitlement("cancelled", [posActive]));
});

test("subscription aktif tanpa add-on → tidak berhak", () => {
  assert.ok(!evaluatePosEntitlement("active", []));
});

test("add-on pos aktif di antara add-on lain → tetap berhak", () => {
  assert.ok(
    evaluatePosEntitlement("active", [
      { status: "active", addOnCode: "extra_session", addOnActive: true },
      posActive,
    ])
  );
});
