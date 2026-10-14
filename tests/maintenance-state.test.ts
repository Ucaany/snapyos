/**
 * Maintenance state — audit lintas-potong.
 * DB error harus terbedakan dari disabled (fail-closed di proxy), dan proxy
 * tidak boleh lagi memakai pembaca boolean yang fail-open.
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const root = new URL("../", import.meta.url);

test("maintenance.ts: state tri-nilai, bukan boolean fail-open", async () => {
  const src = await readFile(new URL("src/lib/maintenance.ts", root), "utf8");
  assert.match(src, /export type MaintenanceState = "enabled" \| "disabled" \| "unavailable"/);
  assert.match(src, /export async function getMaintenanceState/);
  assert.doesNotMatch(src, /export async function isMaintenanceMode/);
  const unavailable = src.match(/unavailable/g) ?? [];
  assert.ok(unavailable.length >= 3, "DB error harus menghasilkan unavailable");
});

test("proxy.ts: fail-closed saat state unavailable, admin tetap lolos saat enabled", async () => {
  const src = await readFile(new URL("src/proxy.ts", root), "utf8");
  assert.match(src, /getMaintenanceState\(\)/);
  assert.match(src, /if \(maintenance === "disabled"\) return NextResponse\.next\(\)/);
  assert.match(src, /if \(maintenance === "enabled"\)/);
  assert.match(src, /Status platform sementara tidak tersedia/);
  // Allowlist operasional tetap dijaga.
  assert.match(src, /"\/api\/webhooks"/);
  assert.match(src, /"\/api\/health"/);
});

test("dokumentasi tidak lagi menyebut maintenance-cache / TTL 30s", async () => {
  const files = [
    "docs/03-architecture.md",
    "docs/10-admin-platform.md",
    "docs/16-feature-map-audit.md",
    "docs/flow-maps/01-ADMIN-CEO-FLOW.md",
  ];
  for (const file of files) {
    const src = await readFile(new URL(file, root), "utf8");
    assert.doesNotMatch(src, /maintenance-cache/, `${file} masih menyebut maintenance-cache`);
  }
});
