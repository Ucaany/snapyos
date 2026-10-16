/**
 * Audit docs/16 §6 — Result page `/r/[token]` (node:test, tanpa framework).
 * Route server component memakai `server-only` → diuji lewat source-text
 * assertion (idiom tests/audit-hardening.test.ts), plus unit murni untuk
 * nama file unduhan.
 * Run: npm test
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const root = new URL("../", import.meta.url);

async function src(path: string): Promise<string> {
  return readFile(new URL(path, root), "utf8");
}

// --- R4: error mapping — hanya NOT_FOUND yang jadi 404 ----------------------

test("result page: hanya ApiError NOT_FOUND yang menjadi notFound(), error lain lempar", async () => {
  const s = await src("src/app/r/[token]/page.tsx");
  assert.ok(
    s.includes("cause instanceof ApiError && cause.code === \"NOT_FOUND\""),
    "page wajib memetakan hanya NOT_FOUND → notFound(); tanpa ini DB down salah dilaporkan sebagai link kedaluwarsa"
  );
  assert.ok(
    s.includes("} catch (cause) {") && !s.includes("} catch {"),
    "catch wajib menangkap error (bukan menelan semua jadi 404)"
  );
});

// --- R1: unduh via URL attachment, bukan atribut download cross-origin ------

test("result page: tombol unduh memakai download_url (Content-Disposition), fallback url", async () => {
  const s = await src("src/app/r/[token]/page.tsx");
  assert.ok(
    s.includes("result.gif_download_url ?? result.gif_url"),
    "tombol Unduh GIF wajib memakai gif_download_url — atribut download pada <a> cross-origin diabaikan browser"
  );
  assert.ok(
    s.includes("p.download_url ?? p.url"),
    "tombol unduh foto wajib memakai download_url per foto"
  );
});

test("getResult: mengembalikan gif_download_url + download_url per foto", async () => {
  const s = await src("src/server/kiosk-sessions.ts");
  assert.ok(
    s.includes("gif_download_url"),
    "getResult wajib menyediakan gif_download_url"
  );
  assert.ok(
    s.includes("download_url: dlMap.get(p.file_key) ?? null"),
    "photoItems dari getResult wajib membawa download_url"
  );
});

test("storage layer: signedUrlMap mendukung nama unduhan per-key", async () => {
  const s = await src("src/server/storage/index.ts");
  assert.ok(
    s.includes("downloadBy?: (key: string) => string"),
    "signedUrlMap wajib menerima mapper nama unduhan per-key"
  );
});

// --- R2: signed URL dirender <img> langsung ---------------------------------

test("result page: tidak memakai next/image untuk signed URL", async () => {
  const s = await src("src/app/r/[token]/page.tsx");
  assert.ok(
    !s.includes("next/image"),
    "signed URL tidak boleh lewat next/image — idiom sama dengan ResultScreen kiosk"
  );
});

// --- Unit murni: nama file unduhan dari key ---------------------------------

test("downloadName: basename key dengan prefix snapyos", async () => {
  const s = await src("src/server/kiosk-sessions.ts");
  const m = s.match(/function downloadName\(key: string\): string \{[\s\S]*?return `snapyos-\$\{base\}`\n\}/);
  assert.ok(m, "downloadName wajib ada dan mengembalikan snapyos-<basename>");
});

// --- R5: loading skeleton ----------------------------------------------------

test("result page: ada loading.tsx (halaman dinamis + presign lambat)", async () => {
  const s = await src("src/app/r/[token]/loading.tsx");
  assert.ok(s.includes("aria-busy"), "loading.tsx wajib ada dengan skeleton");
});
