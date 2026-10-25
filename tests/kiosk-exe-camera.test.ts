/**
 * Phase 9 — copy kegagalan kamera di EXE kiosk.
 *
 * Di WebView2 izin kamera disimpan Windows per aplikasi, bukan dialog browser
 * yang bisa diulang dari halaman. Tanpa pesan yang menyebut Settings, petugas
 * menekan "AKTIFKAN KAMERA" berulang kali dan tetap melihat layar hitam.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { CAMERA_ERRORS, cameraErrorCopy } from "../src/lib/camera-errors.ts";
import { isKioskExe } from "../src/lib/kiosk-shell.ts";

test("EXE: NotAllowedError menyebut Windows Settings dan menyediakan tombol coba lagi", () => {
  const copy = cameraErrorCopy("NotAllowedError", { exe: true });
  assert.match(copy.message, /Windows Settings/);
  assert.match(copy.message, /Privacy/);
  assert.match(copy.message, /Camera/);
  assert.equal(copy.action, "COBA LAGI");
});

test("EXE: NotFoundError juga mengarahkan ke Settings (kamera dimatikan OS)", () => {
  assert.match(cameraErrorCopy("NotFoundError", { exe: true }).message, /Windows Settings/);
});

test("browser: pesan lama tidak berubah", () => {
  assert.deepEqual(cameraErrorCopy("NotAllowedError"), CAMERA_ERRORS.NotAllowedError);
  assert.deepEqual(cameraErrorCopy("NotReadableError", { exe: true }), CAMERA_ERRORS.NotReadableError);
});

test("nama error tak dikenal tetap punya pesan dan aksi", () => {
  const copy = cameraErrorCopy("SomeWeirdError", { exe: true });
  assert.ok(copy.message.length > 0);
  assert.equal(copy.action, "COBA LAGI");
  assert.equal(cameraErrorCopy(null).action, "COBA LAGI");
});

test("isKioskExe: false tanpa window (server/tes), true bila penanda Tauri ada", () => {
  assert.equal(isKioskExe(), false);
  const g = globalThis as { window?: unknown };
  g.window = { __SNAPYOS_EXE__: true };
  try {
    assert.equal(isKioskExe(), true);
  } finally {
    delete g.window;
  }
});
