/**
 * Admin add-on ops — decisions attach/cancel subscription_add_ons
 * (fix inkon sistem admin vs owner). Run: npm test
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { decideAttach, planCancelAddOn } from "../src/lib/admin-addon-ops.ts";
import { ApiError } from "../src/lib/api-errors.ts";
import { adminSubscriptionAddOnCancelSchema } from "../src/lib/validators.ts";

// ---------------------------------------------------------------------------
// decideAttach (fix: attach setelah cancel = reaktivasi)
// ---------------------------------------------------------------------------
test("decideAttach: row null → insert", () => {
  const d = decideAttach(null);
  assert.equal(d.kind, "insert");
  assert.equal(d.reactivated, false);
});

test("decideAttach: row active → update_quantity (behaviour existing)", () => {
  const d = decideAttach({ id: "l-1", status: "active" });
  assert.equal(d.kind, "update_quantity");
  assert.equal(d.reactivated, false);
});

test("decideAttach: row cancelled → reactivate", () => {
  const d = decideAttach({ id: "l-1", status: "cancelled" });
  assert.equal(d.kind, "reactivate");
  assert.equal(d.reactivated, true);
});

test("decideAttach: idempotent — call ulang setelah reaktivasi = update_quantity", () => {
  const first = decideAttach({ id: "l-1", status: "cancelled" });
  assert.equal(first.kind, "reactivate");
  // state setelah reaktivasi (status aktif) — attach ulang tidak error, hanya qty.
  const second = decideAttach({ id: "l-1", status: "active" });
  assert.equal(second.kind, "update_quantity");
  assert.equal(second.reactivated, false);
});

// ---------------------------------------------------------------------------
// planCancelAddOn — deferred (parity owner) vs immediate (audit reason)
// ---------------------------------------------------------------------------
test("planCancelAddOn: deferred → flag cancel_at_period_end, status tidak disentuh (parity owner)", () => {
  const p = planCancelAddOn("deferred");
  assert.deepEqual(p.values, { cancel_at_period_end: true });
  assert.deepEqual(p.auditMeta, { mode: "deferred", manual_cancel_reason: null });
});

test("planCancelAddOn: immediate + reason → status cancelled + reason masuk meta", () => {
  const p = planCancelAddOn("immediate", "  Fraud duplicat  ");
  assert.deepEqual(p.values, { status: "cancelled" });
  assert.equal(p.auditMeta.mode, "immediate");
  assert.equal(p.auditMeta.manual_cancel_reason, "Fraud duplicat");
});

test("planCancelAddOn: immediate tanpa reason → ApiError VALIDATION_ERROR", () => {
  assert.throws(
    () => planCancelAddOn("immediate"),
    (error: unknown) => error instanceof ApiError && error.code === "VALIDATION_ERROR"
  );
  assert.throws(
    () => planCancelAddOn("immediate", "   "),
    (error: unknown) => error instanceof ApiError && error.code === "VALIDATION_ERROR"
  );
});

test("planCancelAddOn: deferred + reason → ApiError (reason tidak dibuang diam-diam)", () => {
  assert.throws(
    () => planCancelAddOn("deferred", "salah kolom"),
    (error: unknown) => error instanceof ApiError && error.code === "VALIDATION_ERROR"
  );
});

// ---------------------------------------------------------------------------
// Schema cancel — mode default deferred, reason bounded
// ---------------------------------------------------------------------------
test("adminSubscriptionAddOnCancelSchema: mode default deferred, reason opsional", () => {
  assert.deepEqual(adminSubscriptionAddOnCancelSchema.parse({}), { mode: "deferred" });
  const parsed = adminSubscriptionAddOnCancelSchema.parse({
    mode: "immediate",
    manual_cancel_reason: "refund dispute",
  });
  assert.equal(parsed.mode, "immediate");
  assert.equal(parsed.manual_cancel_reason, "refund dispute");
});

test("adminSubscriptionAddOnCancelSchema: mode invalid gagal, reason >200 char gagal", () => {
  assert.equal(adminSubscriptionAddOnCancelSchema.safeParse({ mode: "now" }).success, false);
  assert.equal(
    adminSubscriptionAddOnCancelSchema.safeParse({
      mode: "immediate",
      manual_cancel_reason: "x".repeat(201),
    }).success,
    false
  );
});