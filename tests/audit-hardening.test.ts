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

// --- Endpoint baca harus bebas efek samping tulis ---

test("devices.ts: tak ada DELETE di jalur baca (listDevices / generateActivation)", async () => {
  const s = await src("src/server/devices.ts");
  // Handler GET dulu menghapus baris non-aktif, efek samping destruktif pada
  // endpoint baca. Purge pindah ke cron /api/cron/device-cleanup.
  const readPath = s.slice(
    s.indexOf("export async function generateActivation"),
    s.indexOf("export async function revokeDevice")
  );
  assert.ok(
    !/\.delete\(\)/.test(readPath),
    "generateActivation/listDevices tidak boleh menghapus baris; purge milik cron"
  );
  // Purge dicabut dari GET, jadi filter status eksplisit wajib ada di query
  // listDevices sendiri, kalau tidak baris non-aktif ikut terbaca. Dicek pada
  // potongan fungsi listDevices, bukan seluruh file, sebab generateActivation
  // juga memuat string serupa (assertion file-wide lolos palsu di kode lama).
  const listPath = s.slice(
    s.indexOf("export async function listDevices"),
    s.indexOf("export async function revokeDevice")
  );
  assert.ok(
    listPath.includes('.eq("status", "active")'),
    "listDevices wajib memfilter status aktif eksplisit"
  );
});

test("cron device-cleanup: fail-closed + batch berplafon", async () => {
  const s = await src("src/app/api/cron/device-cleanup/route.ts");
  assert.ok(s.includes("bearerMatches("), "cleanup wajib Bearer CRON_SECRET");
  assert.ok(
    s.includes("CRON_SECRET not configured"),
    "cleanup wajib fail-closed saat CRON_SECRET kosong di production"
  );
  assert.ok(s.includes("MAX_ROUNDS"), "cleanup wajib punya plafon ronde batch");
});

// --- Gate lifecycle mutasi ---

test("purchaseTemplateAction: lewat gate lifecycle (paritas write-action)", async () => {
  const s = await src("src/server/template-purchase-actions.ts");
  assert.ok(
    s.includes("requireEffectiveSubscription("),
    "beli template = mutasi; wajib gate lifecycle tunggal seperti aksi tulis lain"
  );
});

// --- Ekspor report berplafon baris ---

test("reports.ts: tiap query ekspor dibatasi + overflow ditolak jelas", async () => {
  const s = await src("src/server/reports.ts");
  assert.ok(
    s.includes("EXPORT_ROW_LIMIT"),
    "ekspor wajib punya plafon baris, sebab rentang 366 hari masih bisa ratusan ribu baris"
  );
  const limits = s.match(/\.limit\(EXPORT_ROW_LIMIT \+ 1\)/g) ?? [];
  assert.equal(
    limits.length,
    3,
    "ketiga sumber (transactions/expenses/voucher_usages) wajib dibatasi"
  );
  assert.ok(
    s.includes('"VALIDATION_ERROR"') && s.includes("melebihi batas ekspor"),
    "overflow harus ditolak VALIDATION_ERROR, bukan diekspor terpotong"
  );
});
