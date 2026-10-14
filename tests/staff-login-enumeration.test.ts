/**
 * Login staff tidak boleh mengenumerasi booth pra-sesi (audit lintas-potong).
 * Sebelumnya `staffLoginBoothsAction(email)` mengembalikan ID + nama booth
 * untuk email anonim mana pun. Sekarang PIN diverifikasi langsung terhadap
 * assignment milik email, tanpa disclosure ke browser.
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const root = new URL("../", import.meta.url);

test("auth-actions tidak lagi mengekspor enumerasi booth pra-login", async () => {
  const src = await readFile(new URL("src/server/auth-actions.ts", root), "utf8");
  assert.doesNotMatch(src, /staffLoginBoothsAction/);
  assert.doesNotMatch(src, /listStaffLoginBooths/);
  assert.match(src, /export async function loginAction/);
  assert.match(src, /export async function logoutAction/);
});

test("staff-pin memverifikasi PIN tanpa mengembalikan daftar booth", async () => {
  const src = await readFile(new URL("src/server/staff-pin.ts", root), "utf8");
  assert.doesNotMatch(src, /listStaffLoginBooths/);
  assert.doesNotMatch(src, /return \[\{ photobox_id/);
  assert.match(src, /export async function verifyStaffPin\(email: string, pin: string\)/);
  assert.match(src, /MAX_PIN_CANDIDATES/);
  assert.match(src, /\.not\("pin_hash", "is", null\)/);
});

test("authorize memakai jalur PIN tanpa photobox_id wajib", async () => {
  const src = await readFile(new URL("src/lib/auth.ts", root), "utf8");
  assert.match(src, /if \(pin\) \{/);
  assert.match(src, /verifyStaffPin\(email, pin\)/);
  // Lockout PIN per email (bukan per booth) karena booth tidak lagi dipilih.
  assert.match(src, /login:pin:\$\{email\}/);
  // Booth tidak lagi bagian dari kontrak credentials, jadi tidak ada jalur yang
  // bisa menyempitkan verifikasi PIN ke satu booth dari klien.
  assert.doesNotMatch(src, /photobox_id/);
});

test("form login tidak memuat selector booth", async () => {
  const src = await readFile(new URL("src/components/auth-block.tsx", root), "utf8");
  assert.doesNotMatch(src, /photobox_id/);
  assert.doesNotMatch(src, /Pilih booth/);
  assert.match(src, /Masuk dengan PIN staff/);
  assert.match(src, /PIN staff/);
});
