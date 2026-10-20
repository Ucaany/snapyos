/**
 * Regression audit admin — mengunci fix audit 2026-10-05:
 * promo update refine, template-category price passthrough contract,
 * plan limits update contract, user-create route contract.
 * Run: npm test
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  adminPlanUpdateSchema,
  adminPromoUpdateSchema,
  adminTemplateCategoryCreateSchema,
  adminUserCreateSchema,
} from "../src/lib/validators.ts";

// --- Promo update: parity dengan create ---
test("adminPromoUpdateSchema: amount 1000 + type percentage ditolak (parity create)", () => {
  assert.equal(
    adminPromoUpdateSchema.safeParse({ type: "percentage", amount: 1000 }).success,
    false
  );
  assert.equal(adminPromoUpdateSchema.safeParse({ type: "percentage", amount: 50 }).success, true);
});

test("adminPromoUpdateSchema: end < start ditolak (parity create)", () => {
  const bad = adminPromoUpdateSchema.safeParse({
    start_date: "2026-02-01T00:00:00.000Z",
    end_date: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(bad.success, false);
  const ok = adminPromoUpdateSchema.safeParse({
    start_date: "2026-01-01T00:00:00.000Z",
    end_date: "2026-02-01T00:00:00.000Z",
  });
  assert.equal(ok.success, true);
});

// --- Template category: price wajib diteruskan REST → server ---
test("adminTemplateCategoryCreateSchema: price nullable diteruskan (kontrak POST)", () => {
  assert.deepEqual(adminTemplateCategoryCreateSchema.parse({ name: "Wedding", price: 50000 }), {
    name: "Wedding",
    price: 50000,
  });
  assert.deepEqual(adminTemplateCategoryCreateSchema.parse({ name: "Wedding", price: null }), {
    name: "Wedding",
    price: null,
  });
  assert.deepEqual(adminTemplateCategoryCreateSchema.parse({ name: "Wedding" }), {
    name: "Wedding",
  });
});

// --- Plan update: semua limit editable pasca-create ---
test("adminPlanUpdateSchema: max_outlets/max_photoboxes/max_staff/max_businesses editable", () => {
  const parsed = adminPlanUpdateSchema.parse({
    max_outlets: 3,
    max_photoboxes: 5,
    max_staff: 10,
    max_businesses: 2,
  });
  assert.equal(parsed.max_outlets, 3);
  assert.equal(parsed.max_photoboxes, 5);
  assert.equal(parsed.max_staff, 10);
  assert.equal(parsed.max_businesses, 2);
});

// --- User create: kontrak POST /api/v1/admin/users ---
test("adminUserCreateSchema: name/email/password/role valid untuk route POST", () => {
  const parsed = adminUserCreateSchema.parse({
    name: "CEO",
    email: "CEO@SnapyOS.biz.id",
    password: "rahasia99",
    role: "admin",
  });
  assert.equal(parsed.email, "ceo@snapyos.biz.id");
  assert.equal(parsed.role, "admin");
});
