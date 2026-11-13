import assert from "node:assert/strict";
import { test } from "node:test";

import { captureCountAllowed } from "./kiosk-capture.ts";

void test("capture pas diterima walau sesi belum expired", () => {
  assert.equal(captureCountAllowed({ expired: false, captureCount: 4, expected: 4 }), true);
});

void test("capture kurang ditolak saat sesi masih berjalan", () => {
  assert.equal(captureCountAllowed({ expired: false, captureCount: 3, expected: 4 }), false);
});

void test("capture parsial diterima saat sesi sudah expired (paid)", () => {
  assert.equal(captureCountAllowed({ expired: true, captureCount: 2, expected: 4 }), true);
});

void test("capture berlebih tetap ditolak walau expired", () => {
  assert.equal(captureCountAllowed({ expired: true, captureCount: 5, expected: 4 }), false);
});

void test("input bukan integer ditolak", () => {
  assert.equal(captureCountAllowed({ expired: true, captureCount: 1.5, expected: 4 }), false);
});
