/**
 * Static regression guards untuk audit lintas-potong (routing, device gate,
 * rate limit, payment credential). Sumber diperiksa sebagai teks: modul ini
 * menyentuh `server-only` + kredensial sehingga tidak bisa di-import di
 * node:test. Pola sama dengan rls-coverage / rpc-privilege.
 * Run: npm test
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const root = new URL("../", import.meta.url);

async function src(path: string): Promise<string> {
  return readFile(new URL(path, root), "utf8");
}

// --- Suspended business gate (src/server/devices.ts) ---

test("resolveActiveDevice: SELECT memuat businesses.status yang dicek", async () => {
  const s = await src("src/server/devices.ts");
  assert.ok(
    s.includes("businesses ( slug, status )"),
    "query wajib memilih businesses.status — tanpa itu guard suspended tak pernah jalan"
  );
  // Guard harus allowlist `active`, bukan blokir `suspended` saja.
  assert.ok(
    s.includes('business.status !== "active"'),
    "guard business harus menolak semua status non-active"
  );
});

// --- Payment credential: tanpa fallback lintas-provider ---

test("payment-create: tidak fallback ke resolveGateway(businessId) saat credential gagal", async () => {
  const s = await src("src/server/payment/payment-create.ts");
  assert.ok(
    !/resolveGateway\(/.test(s),
    "resolveGateway( tidak boleh dipakai — fallback bisa memilih provider/merchant lain"
  );
  assert.ok(s.includes("resolveGatewayByCredential(credentialId)"));
  assert.ok(s.includes("credential_id: credentialId"));
});

test("qris: status poll tidak fallback aggregator saat credential rusak", async () => {
  const s = await src("src/server/payment/qris.ts");
  assert.ok(
    !/resolveGatewayByCredential\(payment\.credential_id\)\)\s*\?\?/.test(s),
    "credential_id path tidak boleh `??` ke gateway lain (dana bisa masuk akun berbeda)"
  );
});

test("registry: pemilihan credential deterministik (provider, lalu updated_at)", async () => {
  const s = await src("src/server/payment/providers/registry.ts");
  assert.ok(
    s.includes('.order("provider", { ascending: true })'),
    "resolveCredential wajib tie-break provider agar tidak bergantung updated_at"
  );
});

// --- Rate limit route device publik ---

test("route device exit/verify/report punya rate limit per IP", async () => {
  const routes = [
    "src/app/api/v1/public/devices/exit/route.ts",
    "src/app/api/v1/public/devices/verify/route.ts",
    "src/app/api/v1/public/devices/report/route.ts",
  ];
  for (const route of routes) {
    const s = await src(route);
    assert.ok(s.includes("rateLimit("), `${route} wajib memanggil rateLimit`);
    assert.ok(s.includes("getClientIp("), `${route} wajib memakai getClientIp`);
  }
});

// --- UUID param guard ---

test("abort session route memvalidasi id sebagai UUID (paritas finalize)", async () => {
  const s = await src("src/app/api/v1/public/[businessSlug]/sessions/[id]/abort/route.ts");
  assert.ok(
    s.includes("parseUuidParam("),
    "abort wajib parseUuidParam sebelum query DB"
  );
});
