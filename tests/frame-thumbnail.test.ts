/**
 * Clamp resize proxy frame — sumber: src/lib/frame-resize.ts (PURE).
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { clampResizeWidth } from "../src/lib/frame-resize.ts";

test("clampResizeWidth: hanya angka masuk akal yang dipakai", () => {
  assert.equal(clampResizeWidth(null), null);
  assert.equal(clampResizeWidth(""), null);
  assert.equal(clampResizeWidth("abc"), null);
  assert.equal(clampResizeWidth("0"), 64);
  assert.equal(clampResizeWidth("-10"), 64);
  assert.equal(clampResizeWidth("480"), 480);
  assert.equal(clampResizeWidth("99999"), 1024);
});

test("clampResizeWidth: nilai pecahan dibulatkan", () => {
  assert.equal(clampResizeWidth("480.6"), 481);
});
