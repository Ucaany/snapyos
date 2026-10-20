import assert from "node:assert/strict";
import { test } from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  can,
  canUnchecked,
  PERMISSIONS,
  type BusinessRole,
  type Permission,
} from "../src/lib/rbac.ts";

test("owner wildcard mengizinkan semua permission POS", () => {
  assert.ok(can("owner", "pos:manage"));
  assert.ok(can("owner", "pos:sell"));
  assert.ok(can("owner", "pos:read"));
});

test("manager: pos:manage/sell/read ✅", () => {
  assert.ok(can("manager", "pos:manage"));
  assert.ok(can("manager", "pos:sell"));
  assert.ok(can("manager", "pos:read"));
});

test("staff (kasir): pos:sell/pos:read ✅, pos:manage ❌", () => {
  assert.ok(can("staff", "pos:sell"));
  assert.ok(can("staff", "pos:read"));
  assert.ok(!can("staff", "pos:manage"));
});

test("staff tidak dapat hardware discovery", () => {
  assert.ok(!can("staff", "photobox:write"));
  assert.ok(can("manager", "photobox:write"));
});

test("permission non-POS existing tidak berubah", () => {
  assert.ok(can("staff", "business:read"));
  assert.ok(!can("staff", "transaction:write"));
  assert.ok(can("manager", "voucher:write"));
  assert.ok(!can("manager", "subscription:write"));
});

/** Kumpulkan permission literal dari `can(role, "…")` di src (double/single quote). */
function collectUsedPermissions(dir: string, out = new Set<string>()): Set<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectUsedPermissions(full, out);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry)) continue;
    const src = readFileSync(full, "utf8");
    for (const m of src.matchAll(/can\(\s*[^,()]+,\s*["']([^"']+)["']\s*\)/g)) {
      out.add(m[1]!);
    }
  }
  return out;
}

const SRC_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

/**
 * Sejak `can()` bertipe `Permission`, typo permission gagal di `npm run
 * typecheck`. Test ini tinggal memastikan setiap literal yang dipakai benar
 * terdaftar di matrix (jaring kedua) dan owner wildcard mencakup semuanya.
 */
test("setiap permission di can() terdaftar di matrix", () => {
  const known = new Set<string>([
    "*",
    ...PERMISSIONS.owner,
    ...PERMISSIONS.manager,
    ...PERMISSIONS.staff,
  ]);
  const used = collectUsedPermissions(SRC_ROOT);
  assert.ok(used.size > 0, "tidak ada pemakaian can() ditemukan");
  for (const p of used) {
    assert.ok(known.has(p), `permission "${p}" dipakai di can() tapi tidak ada di matrix`);
  }
});

test("owner wildcard memiliki semua permission yang dipakai", () => {
  const used = collectUsedPermissions(SRC_ROOT);
  for (const p of used) {
    assert.ok(canUnchecked("owner", p), `owner harus memiliki "${p}" via wildcard`);
  }
});

test("Permission union mencakup seluruh matrix (tanpa string liar)", () => {
  const declared = new Set<string>([...PERMISSIONS.manager, ...PERMISSIONS.staff]);
  const used = collectUsedPermissions(SRC_ROOT);
  for (const p of used) {
    assert.ok(
      declared.has(p) || canUnchecked("owner", p),
      `permission "${p}" harus ada di matrix manager/staff`
    );
  }
});

test("keputusan #6: manager tanpa write sensitif, read tetap boleh", () => {
  const forbidden: Permission[] = [
    "expense:write",
    "subscription:write",
    "transaction:manual-create",
  ];
  for (const p of forbidden) {
    assert.ok(!can("manager" as BusinessRole, p), `manager tidak boleh "${p}"`);
    assert.ok(canUnchecked("owner" as BusinessRole, p), `owner harus memiliki "${p}"`);
  }
  assert.ok(can("manager", "subscription:read"));
  assert.ok(can("manager", "expense:read"));
  assert.ok(!can("staff", "subscription:read"));
});
