/**
 * Batas klon body proxy Next 16 (`experimental.proxyClientMaxBodySize`).
 *
 * Kenapa ini diuji: `src/proxy.ts` match hampir semua path (termasuk route
 * finalize kiosk). Next mengklon body untuk proxy dan **memotongnya diam-diam**
 * pada batas ini — bukan menolak. Default Next 10 MB, sedangkan cap finalize
 * app 50 MB (`FINALIZE_MAX_REQUEST_BYTES`). Akibatnya upload kiosk 10–50 MB
 * sampai di route dalam keadaan terpotong: `request.formData()` melempar
 * "Failed to parse body as FormData" dan route membalas **500** — padahal
 * payload-nya sah menurut batas app.
 *
 * Reproduksi (sebelum perbaikan, dev server):
 *   POST 11 MB ke /api/v1/public/<slug>/sessions/<id>/finalize
 *   → log: "Request body exceeded 10MB ... Only the first 10MB will be available"
 *   → TypeError: Failed to parse body as FormData  → 500
 * Sesudah `proxyClientMaxBodySize: "52mb"`: 49 MB terparse penuh (422 dari
 * validasi app), 55 MB dibalas 413 oleh route.
 *
 * Yang dijaga tes ini: batas proxy harus SELALU di atas cap finalize, supaya
 * route (bukan proxy) yang menentukan nasib body kebesaran.
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const ROOT = new URL("../", import.meta.url);

async function nextConfigSource(): Promise<string> {
  return readFile(new URL("next.config.ts", ROOT), "utf8");
}

async function finalizeCapBytes(): Promise<number> {
  const src = await readFile(new URL("src/lib/upload-validation.ts", ROOT), "utf8");
  const m = src.match(/FINALIZE_MAX_REQUEST_BYTES\s*=\s*([0-9*\s]+);/);
  assert.ok(m, "FINALIZE_MAX_REQUEST_BYTES tidak ditemukan");
  // Ekspresi berbentuk "50 * 1024 * 1024" — kalikan faktor-faktornya.
  return m![1]!
    .split("*")
    .map((part) => Number(part.trim()))
    .reduce((a, b) => a * b, 1);
}

/** "52mb" / "52 MB" / 54525952 → bytes. */
function parseSize(value: string): number {
  const m = value.match(/^(\d+)\s*(mb|kb|b)?$/i);
  if (!m) throw new Error(`format ukuran tidak dikenal: ${value}`);
  const n = Number(m[1]);
  const unit = (m[2] ?? "b").toLowerCase();
  return unit === "mb" ? n * 1024 * 1024 : unit === "kb" ? n * 1024 : n;
}

test("proxy body limit di-set eksplisit di next.config.ts", async () => {
  const src = await nextConfigSource();
  assert.match(
    src,
    /proxyClientMaxBodySize:\s*"/,
    "proxyClientMaxBodySize harus di-set (default 10 MB memotong upload finalize)"
  );
});

test("batas proxy > cap finalize app (route yang memutuskan, bukan proxy)", async () => {
  const src = await nextConfigSource();
  const m = src.match(/proxyClientMaxBodySize:\s*"([^"]+)"/);
  assert.ok(m, "nilai proxyClientMaxBodySize tidak terbaca");
  const proxyLimit = parseSize(m![1]!);
  const cap = await finalizeCapBytes();
  assert.ok(
    proxyLimit > cap,
    `batas proxy (${proxyLimit}B) harus > cap finalize (${cap}B); ` +
      `jika tidak, body terpotong sebelum route bisa membalas 413`
  );
});

test("cap finalize tetap 50 MB (kontrak docs/04 §4.10)", async () => {
  assert.equal(await finalizeCapBytes(), 50 * 1024 * 1024);
});

test("batas proxy tidak keterlaluan (mencegah buffer memori tak terbatas)", async () => {
  const src = await nextConfigSource();
  const m = src.match(/proxyClientMaxBodySize:\s*"([^"]+)"/)!;
  const proxyLimit = parseSize(m[1]!);
  // Beri ruang untuk overhead multipart di atas cap 50 MB, tapi tidak berlipat.
  assert.ok(
    proxyLimit <= 64 * 1024 * 1024,
    `batas proxy ${proxyLimit}B terlalu besar — body di-buffer penuh di memori`
  );
});
