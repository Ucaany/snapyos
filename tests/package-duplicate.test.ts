/**
 * Nama paket hasil duplikat — MURNI (tanpa Supabase).
 * Run: npm test
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { PACKAGE_NAME_MAX, packageCopyName } from "../src/lib/package-copy.ts";

test("packageCopyName: menambah suffix (salinan)", () => {
  assert.equal(packageCopyName("BASIC"), "BASIC (salinan)");
});

test("packageCopyName: memotong total ke 80 karakter", () => {
  const name = "X".repeat(200);
  const result = packageCopyName(name);
  assert.equal(result.length, PACKAGE_NAME_MAX);
  assert.ok(result.endsWith(" (salinan)"));
});

test("packageCopyName: nama 80 karakter tetap sah setelah suffix", () => {
  const result = packageCopyName("A".repeat(PACKAGE_NAME_MAX));
  assert.equal(result.length, PACKAGE_NAME_MAX);
  assert.ok(result.endsWith(" (salinan)"));
});

test("packageCopyName: trim spasi tepi", () => {
  assert.equal(packageCopyName("  PROMO  "), "PROMO (salinan)");
});
