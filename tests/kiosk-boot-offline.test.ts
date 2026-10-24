/**
 * Phase 5: keputusan boot offline.
 *
 * Yang diuji adalah aturan yang tidak boleh dilonggarkan: FORBIDDEN selalu
 * membuang token, slug runtime harus cocok, dan error server (4xx/5xx) tidak
 * boleh jatuh ke jalur offline.
 *
 * Run: npm test
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { KioskError } from "../src/components/kiosk/api.ts";
import { canBootOffline, isNetworkFailure } from "../src/components/kiosk/boot-offline.ts";

const SLUG = "booth-a";
const matching = { photobox_slug: SLUG };

test("jaringan mati + slug cocok: boleh boot offline", () => {
  assert.equal(canBootOffline(new KioskError("NETWORK", "putus"), matching, SLUG), true);
  assert.equal(canBootOffline(new KioskError("TIMEOUT", "lambat"), matching, SLUG), true);
});

test("FORBIDDEN tidak pernah boot offline", () => {
  const forbidden = new KioskError("FORBIDDEN", "token ditolak");
  assert.equal(isNetworkFailure(forbidden), false);
  assert.equal(canBootOffline(forbidden, matching, SLUG), false);
});

test("error server (5xx, rate limit) tidak boot offline", () => {
  for (const code of ["INTERNAL", "RATE_LIMITED", "NOT_FOUND"]) {
    assert.equal(canBootOffline(new KioskError(code, "x"), matching, SLUG), false, code);
  }
});

test("slug tidak cocok: jangan masuk welcome", () => {
  const network = new KioskError("NETWORK", "putus");
  assert.equal(canBootOffline(network, { photobox_slug: "booth-b" }, SLUG), false);
  assert.equal(canBootOffline(network, { photobox_slug: "" }, SLUG), false);
});

test("runtime tidak menjawab / status tanpa slug: jangan masuk welcome", () => {
  const network = new KioskError("NETWORK", "putus");
  assert.equal(canBootOffline(network, null, SLUG), false);
  assert.equal(canBootOffline(network, {}, SLUG), false);
  assert.equal(canBootOffline(network, undefined, SLUG), false);
});
