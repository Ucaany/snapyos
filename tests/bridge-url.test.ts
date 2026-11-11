/**
 * Resolver URL bridge lokal — MURNI.
 * Run: npm test
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_BRIDGE_URL, resolveBridgeUrl } from "../src/lib/bridge-url.ts";

test("resolveBridgeUrl: kosong -> default 127.0.0.1:17777", () => {
  assert.equal(resolveBridgeUrl(), DEFAULT_BRIDGE_URL);
  assert.equal(resolveBridgeUrl({}), DEFAULT_BRIDGE_URL);
  assert.equal(resolveBridgeUrl({ bridge_url: "   " }), DEFAULT_BRIDGE_URL);
});

test("resolveBridgeUrl: nilai tanpa skema diberi http://", () => {
  assert.equal(resolveBridgeUrl({ bridge_url: "10.0.0.5:17777" }), "http://10.0.0.5:17777");
});

test("resolveBridgeUrl: skema http/https dipertahankan", () => {
  assert.equal(resolveBridgeUrl({ bridge_url: "https://bridge.local:8443" }), "https://bridge.local:8443");
});

test("resolveBridgeUrl: trailing slash dibuang", () => {
  assert.equal(resolveBridgeUrl({ bridge_url: "http://h:1///" }), "http://h:1");
});
