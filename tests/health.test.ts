/**
 * Health/readiness endpoint — kontrak & semantik probe.
 *
 * Sebelumnya `/api/health` selalu 200 walau Supabase/R2 mati, sehingga Nginx,
 * systemd, dan uptime monitor tidak bisa memakainya. Logika probe dipindah ke
 * `src/lib/health.ts` (pure) supaya bisa diuji di sini tanpa `next/server`.
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  HEALTH_PROBE_TIMEOUT_MS,
  buildHealthReport,
  probe,
  sanitizeDetail,
  type HealthCheck,
} from "../src/lib/health.ts";

const root = new URL("../", import.meta.url);
const ok = (latencyMs = 1): HealthCheck => ({ ok: true, latencyMs });

test("probe: sukses → ok tanpa detail, latency dari jam terinjeksi", async () => {
  let t = 1000;
  const result = await probe(async () => {}, { now: () => (t += 7) });
  assert.equal(result.ok, true);
  assert.equal(result.detail, undefined);
  assert.equal(result.latencyMs, 7);
});

test("probe: throw → ok:false + detail, TIDAK melempar ke pemanggil", async () => {
  const result = await probe(async () => {
    throw new Error("koneksi ditolak");
  });
  assert.equal(result.ok, false);
  assert.equal(result.detail, "koneksi ditolak");
});

test("probe: nilai non-Error tetap aman", async () => {
  const result = await probe(async () => {
    throw "boom";
  });
  assert.equal(result.ok, false);
  assert.equal(result.detail, "boom");
});

test("probe: timeout → ok:false dengan detail timeout", async () => {
  const result = await probe(
    () => new Promise<void>(() => {}), // tidak pernah selesai
    { timeoutMs: 20 }
  );
  assert.equal(result.ok, false);
  assert.match(result.detail ?? "", /^timeout 20ms$/);
});

test("probe: timeout tidak menahan event loop (timer dibersihkan)", async () => {
  const before = process.getActiveResourcesInfo?.().length ?? 0;
  await probe(async () => {}, { timeoutMs: HEALTH_PROBE_TIMEOUT_MS });
  const after = process.getActiveResourcesInfo?.().length ?? 0;
  assert.ok(after <= before + 1, `kebocoran timer: ${before} → ${after}`);
});

test("sanitizeDetail: kredensial di URL dibuang, panjang dibatasi", () => {
  assert.equal(
    sanitizeDetail("fetch gagal: https://user:rahasia@db.example.com/rest"),
    "fetch gagal: https://db.example.com/rest"
  );
  const long = sanitizeDetail("x".repeat(500));
  assert.equal(long.length, 201); // 200 + elipsis
  assert.ok(long.endsWith("…"));
  assert.equal(sanitizeDetail("  spasi\n\nbaru  "), "spasi baru");
});

test("sanitizeDetail: probe gagal tidak membocorkan kredensial ke respons", async () => {
  const result = await probe(async () => {
    throw new Error("PostgREST https://postgres:s3cret@proj.supabase.co tidak terjangkau");
  });
  assert.equal(result.ok, false);
  assert.doesNotMatch(result.detail ?? "", /s3cret/);
  assert.match(result.detail ?? "", /proj\.supabase\.co/);
});

test("buildHealthReport: keduanya lulus → ok, 200", () => {
  const report = buildHealthReport({
    database: ok(),
    storage: ok(),
    now: () => Date.parse("2026-10-16T00:00:00.000Z"),
  });
  assert.equal(report.status, "ok");
  assert.equal(report.service, "snapyos");
  assert.equal(report.time, "2026-10-16T00:00:00.000Z");
  assert.deepEqual(Object.keys(report.checks).sort(), ["database", "storage"]);
});

test("buildHealthReport: salah satu gagal → degraded (bukan ok)", () => {
  const dbDown = buildHealthReport({
    database: { ok: false, latencyMs: 5, detail: "ECONNREFUSED" },
    storage: ok(),
  });
  assert.equal(dbDown.status, "degraded");

  const storageDown = buildHealthReport({
    database: ok(),
    storage: { ok: false, latencyMs: 5, detail: "R2 403" },
  });
  assert.equal(storageDown.status, "degraded");
});

test("route: 503 saat degraded, 200 saat ok, dan tidak pernah melempar", async () => {
  const src = await readFile(new URL("src/app/api/health/route.ts", root), "utf8");
  assert.match(src, /status: report\.status === "ok" \? 200 : 503/);
  assert.match(src, /buildHealthReport\(\{ database, storage \}\)/);
  // Probe DB + storage nyata, bukan payload statis.
  assert.match(src, /probeDatabase/);
  assert.match(src, /probeStorage/);
  assert.match(src, /storage\.head\("generated-photos"/);
  // Path ini di allowlist proxy: jalur respons GET tidak boleh melempar —
  // semua kegagalan sudah dinormalkan `probe()` menjadi `checks.*.ok`.
  const getBody = src.slice(src.indexOf("export async function GET"));
  assert.doesNotMatch(getBody, /\bthrow\b/);
});

test("route: tetap menyertakan bentuk respons lama (status/service/time)", async () => {
  const src = await readFile(new URL("src/app/api/health/route.ts", root), "utf8");
  assert.match(src, /buildHealthReport/);
  const lib = await readFile(new URL("src/lib/health.ts", root), "utf8");
  assert.match(lib, /status: "ok" \| "degraded"/);
  assert.match(lib, /service: string/);
  assert.match(lib, /time: string/);
});
