/**
 * RBAC matrix — audit lengkap `can(role, permission)` (Fase 5).
 * Menjaga invariant docs/09 + docs/pos/01 §6:
 *   - owner = wildcard (mengizinkan permission apa pun, incl. owner-only).
 *   - manager = operasional penuh + finance read; TIDAK boleh transaksi manual,
 *     TIDAK boleh subscription:write.
 *   - staff = read-only outlet/photobox/package/template + POS sell/read.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { PERMISSIONS, can, canUnchecked, type BusinessRole, type Permission } from "../src/lib/rbac.ts";

const OWNER_ONLY = [
  "expense:write",
  "subscription:write",
  "transaction:manual-create",
] as const;

const MANAGER_ALLOWED = [
  "business:read",
  "business:update",
  "outlet:read",
  "outlet:write",
  "photobox:read",
  "photobox:write",
  "transaction:read",
  "transaction:write",
  "finance:read",
  "expense:read",
  "package:read",
  "package:write",
  "template:read",
  "template:write",
  "voucher:read",
  "voucher:write",
  "customer:read",
  "staff:read",
  "report:read",
  "subscription:read",
  "pos:manage",
  "pos:sell",
  "pos:read",
  "payment:confirm",
] as const;

const STAFF_ALLOWED = [
  "business:read",
  "outlet:read",
  "photobox:read",
  "package:read",
  "template:read",
  "pos:sell",
  "pos:read",
  "payment:confirm",
] as const;

test("owner: wildcard mengizinkan seluruh permission (existing + owner-only)", () => {
  const universe = new Set<string>([
    ...MANAGER_ALLOWED,
    ...STAFF_ALLOWED,
    ...OWNER_ONLY,
    // Sanity: permission acak apa pun juga diizinkan (bug-guard wildcard).
    "some:future-permission",
    "arbitrary:string",
  ]);
  for (const p of universe) {
    assert.ok(canUnchecked("owner", p), `owner harus dapat "${p}"`);
  }
});

test("manager: semua permission operasional + finance read = allowed", () => {
  for (const p of MANAGER_ALLOWED) {
    assert.ok(can("manager", p), `manager harus dapat "${p}"`);
  }
});

test("manager: TIDAK boleh permission owner-only", () => {
  for (const p of OWNER_ONLY) {
    assert.ok(!can("manager", p), `manager TIDAK boleh dapat "${p}"`);
  }
});

test("staff: read-only + POS sell/read = allowed", () => {
  for (const p of STAFF_ALLOWED) {
    assert.ok(can("staff", p), `staff harus dapat "${p}"`);
  }
});

test("staff: TIDAK boleh mutasi (write/manage), finance, atau owner-only", () => {
  const denyForStaff: Permission[] = [
    "outlet:write",
    "photobox:write",
    "package:write",
    "template:write",
    "voucher:write",
    "transaction:write",
    "pos:manage",
    "finance:read",
    "expense:read",
    "subscription:read",
    "subscription:write",
    "transaction:manual-create",
    "expense:write",
  ];
  for (const p of denyForStaff) {
    assert.ok(!can("staff", p), `staff TIDAK boleh dapat "${p}"`);
  }
});

test("transaction:manual-create HANYA owner (invariant non-withdrawable, docs/03)", () => {
  const roles: BusinessRole[] = ["owner", "manager", "staff"];
  const allowed = roles.filter((r) => can(r, "transaction:manual-create"));
  assert.deepEqual(allowed, ["owner"]);
});

test("pos:manage HANYA owner + manager (staff = kasir)", () => {
  const roles: BusinessRole[] = ["owner", "manager", "staff"];
  const allowed = roles.filter((r) => can(r, "pos:manage"));
  assert.deepEqual(allowed, ["owner", "manager"]);
});

test("PERMISSIONS.owner harus mengandung '*' (wildcard invariant)", () => {
  assert.ok(PERMISSIONS.owner.includes("*"));
});
