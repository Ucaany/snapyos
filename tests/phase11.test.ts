/**
 * Phase 11 unit checks — retention cutoff + rbac billing owner-only
 * (docs/09 storage retention, docs/12 Phase 11).
 * Run: npm test
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_RETENTION_DAYS, retentionCutoff } from "../src/lib/retention.ts";
import { can } from "../src/lib/rbac.ts";
import { bearerMatches } from "../src/lib/cron-auth.ts";

test("retentionCutoff: now − retention_days (default 3 per keputusan #4)", () => {
  const now = Date.parse("2026-08-19T12:00:00.000Z");
  assert.equal(retentionCutoff(3, now), new Date("2026-08-16T12:00:00.000Z").toISOString());
  assert.equal(retentionCutoff(30, now), new Date("2026-07-20T12:00:00.000Z").toISOString());
  assert.equal(DEFAULT_RETENTION_DAYS, 3);
});

test("retentionCutoff: guard input tidak valid", () => {
  const now = Date.now();
  // days tidak sehat → fallback default (3 hari; keputusan #4)
  assert.equal(retentionCutoff(0, now), new Date(now - 3 * 86_400_000).toISOString());
  assert.equal(retentionCutoff(-5, now), retentionCutoff(3, now));
  assert.throws(() => retentionCutoff(3, NaN));
});

test("RBAC: mutasi subscription hanya owner (billing owner-only)", () => {
  assert.equal(can("owner", "subscription:write"), true);
  assert.equal(can("manager", "subscription:write"), false);
  assert.equal(can("staff", "subscription:write"), false);
  // view pakai business:read — semua role boleh melihat
  assert.equal(can("owner", "business:read"), true);
  assert.equal(can("manager", "business:read"), true);
  assert.equal(can("staff", "business:read"), true);
});

test("bearerMatches: timing-safe, fail-closed", () => {
  assert.equal(bearerMatches("Bearer s3cret", "s3cret"), true);
  assert.equal(bearerMatches("Bearer wrong", "s3cret"), false);
  assert.equal(bearerMatches(null, "s3cret"), false);
  assert.equal(bearerMatches("", "s3cret"), false);
  // panjang beda tidak throw
  assert.equal(bearerMatches("Bearer s3cret-extra", "s3cret"), false);
});
