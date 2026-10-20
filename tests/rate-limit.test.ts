/**
 * Rate-limiter fixed-window (`src/lib/rate-limit.ts`).
 * Kunci invariant docs/08 §8.18: limit strict `>` bukan `>=`, sekali habis
 * → tolak sampai window reset. Semua endpoint (login, checkout, activate,
 * withdrawal, dll.) memakai wrapper ini — regresi = 429/rate leak.
 *
 * Backend in-memory, jadi test tidak butuh jaringan.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  rateLimit,
  rateLimitByDevice,
  registerFailure,
  resetLimit,
} from "../src/lib/rate-limit.ts";

/** Key unik per-test agar bucket in-memory tidak bocor antar test. */
function k(prefix: string): string {
  return `${prefix}:${Math.random().toString(36).slice(2)}:${Date.now()}`;
}

test("skenario withdrawal 4/menit: request 1-4 lolos, request ke-5 ditolak (429)", async () => {
  const key = k("withdrawal");
  for (let i = 1; i <= 4; i++) {
    const r = await rateLimit(key, 4, 60_000);
    assert.equal(r.ok, true, `request #${i} harus lolos`);
    assert.equal(r.retryAfterSec, 0);
  }
  const denied = await rateLimit(key, 4, 60_000);
  assert.equal(denied.ok, false, "request ke-5 harus DITOLAK (429)");
  assert.ok(denied.retryAfterSec > 0, "retryAfterSec harus > 0 saat ditolak");
  assert.ok(denied.retryAfterSec <= 60, "retryAfterSec ≤ windowMs/1000");
});

test("skenario login 5/menit (pattern src/lib/auth.ts:105)", async () => {
  const key = k("login:ip");
  for (let i = 1; i <= 5; i++) {
    assert.equal((await rateLimit(key, 5, 60_000)).ok, true, `login ke-${i} lolos`);
  }
  assert.equal((await rateLimit(key, 5, 60_000)).ok, false, "login ke-6 ditolak");
});

test("reset window (windowMs habis): bucket refresh, request lagi lolos", async () => {
  const key = k("short");
  assert.equal((await rateLimit(key, 1, 40)).ok, true);
  assert.equal((await rateLimit(key, 1, 40)).ok, false);
  // Tunggu > windowMs supaya bucket expired.
  await new Promise((r) => setTimeout(r, 55));
  assert.equal((await rateLimit(key, 1, 40)).ok, true, "setelah reset harus lolos lagi");
});

test("registerFailure: increment monoton (dipakai lockout email)", async () => {
  const key = k("email");
  assert.equal(await registerFailure(key, 60_000), 1);
  assert.equal(await registerFailure(key, 60_000), 2);
  assert.equal(await registerFailure(key, 60_000), 3);
});

test("resetLimit: bucket dihapus (login sukses → reset counter)", async () => {
  const key = k("email-reset");
  await registerFailure(key, 60_000);
  await registerFailure(key, 60_000);
  await resetLimit(key);
  // Setelah reset, permintaan pertama harus mulai dari 1 lagi.
  const first = await rateLimit(key, 3, 60_000);
  assert.equal(first.ok, true);
});

test("key berbeda = bucket independen (isolasi per-IP/per-user)", async () => {
  const a = k("ip-A");
  const b = k("ip-B");
  for (let i = 1; i <= 3; i++) await rateLimit(a, 3, 60_000);
  assert.equal((await rateLimit(a, 3, 60_000)).ok, false, "A terkuras");
  assert.equal((await rateLimit(b, 3, 60_000)).ok, true, "B masih bersih");
});

test("rateLimitByDevice: dua booth (device) punya bucket independen", async () => {
  const route = `session:${Math.random().toString(36).slice(2)}`;
  const tokenA = "a".repeat(64);
  const tokenB = "b".repeat(64);
  for (let i = 0; i < 3; i++) {
    assert.equal(
      (await rateLimitByDevice(route, tokenA, 3, 60_000))?.ok,
      true,
      `A request #${i + 1}`
    );
  }
  assert.equal((await rateLimitByDevice(route, tokenA, 3, 60_000))?.ok, false, "A ke-4 ditolak");
  assert.equal(
    (await rateLimitByDevice(route, tokenB, 3, 60_000))?.ok,
    true,
    "B tidak terpengaruh A"
  );
});

test("rateLimitByDevice: token null = null (route tetap jalan dengan limit IP)", async () => {
  assert.equal(await rateLimitByDevice("session", null, 3, 60_000), null);
  assert.equal(await rateLimitByDevice("session", undefined, 3, 60_000), null);
  assert.equal(await rateLimitByDevice("session", "", 3, 60_000), null);
});

test("rateLimitByDevice: prefix sama (token beda ekor) = bucket sama (hash 16 char awal)", async () => {
  const route = `session:${Math.random().toString(36).slice(2)}`;
  const head = "c".repeat(16);
  const token1 = `${head}${"1".repeat(48)}`;
  const token2 = `${head}${"2".repeat(48)}`;
  for (let i = 0; i < 2; i++) await rateLimitByDevice(route, token1, 2, 60_000);
  assert.equal(
    (await rateLimitByDevice(route, token2, 2, 60_000))?.ok,
    false,
    "prefix sama berbagi bucket (v1: hash hanya prefix — bukan token utuh)"
  );
});
