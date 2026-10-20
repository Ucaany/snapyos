/**
 * Shortcut kiosk — urutan cek keluar vs blokir (regresi Ctrl+Alt+X tertelan).
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { isBlockedShortcut, isExitShortcut } from "../src/lib/kiosk-lock.ts";

test("Ctrl+Alt+X dikenali sebagai shortcut keluar", () => {
  assert.equal(isExitShortcut({ key: "x", ctrlKey: true, altKey: true }), true);
  assert.equal(isExitShortcut({ key: "X", ctrlKey: true, altKey: true }), true);
});

test("shortcut keluar tidak dikenali tanpa kedua modifier", () => {
  assert.equal(isExitShortcut({ key: "x", ctrlKey: true }), false);
  assert.equal(isExitShortcut({ key: "x", altKey: true }), false);
  assert.equal(isExitShortcut({ key: "y", ctrlKey: true, altKey: true }), false);
});

test("Ctrl+Alt+X tidak termasuk shortcut yang diblokir", () => {
  // Regresi: dulu `altKey` menelan kombinasi ini sebelum cabang keluar.
  assert.equal(isBlockedShortcut({ key: "x", ctrlKey: true, altKey: true }), false);
});

test("Escape, F11, Alt tunggal, dan Meta diblokir", () => {
  assert.equal(isBlockedShortcut({ key: "Escape" }), true);
  assert.equal(isBlockedShortcut({ key: "F11" }), true);
  assert.equal(isBlockedShortcut({ key: "Tab", altKey: true }), true);
  assert.equal(isBlockedShortcut({ key: "w", metaKey: true }), true);
});

test("Ctrl+W/N/T/R dan Ctrl+Shift+I/J/C diblokir", () => {
  for (const key of ["w", "n", "t", "r"]) {
    assert.equal(isBlockedShortcut({ key, ctrlKey: true }), true, `Ctrl+${key}`);
  }
  for (const key of ["i", "j", "c"]) {
    assert.equal(
      isBlockedShortcut({ key, ctrlKey: true, shiftKey: true }),
      true,
      `Ctrl+Shift+${key}`
    );
  }
});

test("tombol biasa dan AltGr (Ctrl+Alt+non-X) tidak diblokir", () => {
  assert.equal(isBlockedShortcut({ key: "a" }), false);
  assert.equal(isBlockedShortcut({ key: "@", ctrlKey: true, altKey: true }), false);
  assert.equal(isBlockedShortcut({ key: "i", ctrlKey: true }), false);
});
