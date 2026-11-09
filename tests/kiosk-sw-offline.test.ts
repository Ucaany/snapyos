/**
 * Phase 5: service worker offline boot.
 *
 * Yang diuji hanya janji yang dipegang SW: navigasi kiosk `/p/*` punya
 * fallback cache, halaman lain tidak, dan aset pendukung HTML ikut disimpan.
 * sw.js adalah skrip browser tanpa modul — dibaca sebagai teks, bukan dijalankan.
 *
 * Run: npm test
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = readFileSync(fileURLToPath(new URL("../public/sw.js", import.meta.url)), "utf8");

/** Badan handler `fetch` — satu-satunya tempat cabang navigate diputuskan. */
const fetchHandler = source.slice(source.indexOf('addEventListener("fetch"'));

test("versi cache naik ke v7", () => {
  assert.match(source, /snapyos-kiosk-v7/);
  assert.doesNotMatch(source, /snapyos-kiosk-v6/);
  assert.doesNotMatch(source, /snapyos-kiosk-v5/);
});

test("cache navigasi dipisah dari cache aset", () => {
  assert.match(source, /NAV_CACHE\s*=\s*"snapyos-kiosk-nav-v7"/);
  assert.notEqual(
    /CACHE\s*=\s*"([^"]+)"/.exec(source)?.[1],
    /NAV_CACHE\s*=\s*"([^"]+)"/.exec(source)?.[1]
  );
});

test("navigate /p/* punya fallback cache", () => {
  // Cabang navigate harus memanggil helper, bukan `return` tanpa respondWith.
  assert.match(fetchHandler, /request\.mode === "navigate"/);
  assert.match(fetchHandler, /url\.pathname\.startsWith\(KIOSK_PATH_PREFIX\)/);
  assert.match(fetchHandler, /event\.respondWith\(navigateNetworkFirst\(/);
});

test("navigate di luar /p/* tetap network murni", () => {
  const branch = fetchHandler.slice(fetchHandler.indexOf('request.mode === "navigate"'));
  const beforeRespond = branch.slice(0, branch.indexOf("respondWith"));
  assert.match(beforeRespond, /if \(!url\.pathname\.startsWith\(KIOSK_PATH_PREFIX\)\) return;/);
});

test("fallback memakai cache navigasi, bukan cache aset", () => {
  const helper = source.slice(source.indexOf("function navigateNetworkFirst"));
  assert.match(helper, /caches\.open\(NAV_CACHE\)/);
  assert.match(helper, /cache\.match\(request\)/);
  assert.match(helper, /Response\.error\(\)/);
});

test("<script src> dan <link rel=stylesheet> HTML tersimpan ikut di-cache", () => {
  const helper = source.slice(source.indexOf("async function cacheHtmlAssets"));
  assert.match(helper, /<script\\b\[\^>\]\*\\bsrc=/);
  assert.match(helper, /stylesheet/i);
  assert.match(helper, /caches\.open\(CACHE\)/);
});

test("cache aset template dipertahankan saat activate", () => {
  assert.match(source, /FRAME_CACHE\s*=\s*"snapyos-template-assets-v1"/);
  assert.match(source, /k !== CACHE && k !== NAV_CACHE && k !== FRAME_CACHE/);
});

test("proxy frame: cache-first dari FRAME_CACHE, tanpa cache.put", () => {
  const branch = fetchHandler.slice(0, fetchHandler.indexOf('url.pathname.startsWith("/api/")'));
  assert.match(branch, /pathname === "\/api\/v1\/public\/frame"/);
  assert.match(branch, /cacheKey\.length <= 64/);
  assert.match(branch, /cache\.match\(key\)/);
  assert.match(branch, /hit \?\? fetch\(request\)/);
  assert.doesNotMatch(branch, /cache\.put/);
  // Key harus identik dengan frameCacheUrl(): basis ter-encode + suffix di luar.
  assert.match(
    branch,
    /\$\{self\.location\.origin\}\/__frame\/\$\{encodeURIComponent\(cacheKey\)\}@\$\{w\}/
  );
});
