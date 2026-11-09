/**
 * Predikat hijau layar kroma (pure, tanpa DOM). Dipakai bersama deteksi slot
 * (`frame-chroma.ts`) dan pembersihan file frame (`template-chroma.ts`).
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { isGreenBackground } from "../src/lib/chroma-key.ts";

test("isGreenBackground: dominasi hijau dan nuansa hijau diterima", () => {
  assert.equal(isGreenBackground([0, 177, 64]), true);
  assert.equal(isGreenBackground([80, 200, 120]), true);
  assert.equal(isGreenBackground([0, 255, 0]), true);
  assert.equal(isGreenBackground([10, 120, 20]), true);
});

test("isGreenBackground: biru, abu, merah, dan hitam ditolak", () => {
  assert.equal(isGreenBackground([0, 0, 255]), false);
  assert.equal(isGreenBackground([128, 128, 128]), false);
  assert.equal(isGreenBackground([220, 40, 40]), false);
  assert.equal(isGreenBackground([0, 0, 0]), false);
  assert.equal(isGreenBackground([255, 255, 255]), false);
});

test("isGreenBackground: hijau gelap di bawah ambang value ditolak", () => {
  // Hue hijau tapi terlalu gelap (value 0.15 batas) dan tidak dominan cukup.
  assert.equal(isGreenBackground([10, 20, 10]), false);
});
