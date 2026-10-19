/**
 * Revocation sesi — docs/09 §10.
 *
 * Transport cookie Auth.js = JWT, jadi satu-satunya cara mematikan sesi dari
 * server adalah cek `public.auth_sessions` tiap request. Logika itu ada di
 * `resolveTokenAfterRevocationCheck` (`src/lib/auth.ts`); sebelum dipisah,
 * jalur ini tidak punya tes sama sekali — padahal ini inti kontrol logout paksa
 * dan satu-satunya tempat yang menentukan sesi hidup/mati.
 *
 * Aturan yang dikunci: SEMUA jalur gagal → klaim dibuang (`{}`), tidak pernah
 * membiarkan sesi hidup. Termasuk outage DB (fail-closed).
 */

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./tests/helpers/resolve-loader.mjs", pathToFileURL("./"));

const NOW = Date.parse("2026-10-16T12:00:00.000Z");
const FUTURE = new Date(NOW + 60_000).toISOString();
const PAST = new Date(NOW - 60_000).toISOString();

type Auth = typeof import("../src/lib/auth.ts");
let resolveToken: Auth["resolveTokenAfterRevocationCheck"];

before(async () => {
  ({ resolveTokenAfterRevocationCheck: resolveToken } = await import("../src/lib/auth.ts"));
});

const token = { uid: "user-1", sid: "sid-1", role: "user" as const };

test("sesi valid → token dipertahankan, role di-refresh dari DB", () => {
  const out = resolveToken({
    token,
    row: { expires: FUTURE, users: { role: "admin", status: "active" } },
    rowError: null,
    now: NOW,
  });
  assert.equal(out.uid, "user-1");
  assert.equal(out.sid, "sid-1");
  assert.equal(out.role, "admin", "role harus diambil dari public.users");
});

test("baris sesi hilang (sudah direvoke) → klaim dibuang", () => {
  const out = resolveToken({ token, row: null, rowError: null, now: NOW });
  assert.deepEqual(out, {});
  assert.equal(out.uid, undefined, "tidak boleh menyisakan identitas");
});

test("baris sesi kedaluwarsa → klaim dibuang", () => {
  const out = resolveToken({
    token,
    row: { expires: PAST, users: { role: "user", status: "active" } },
    rowError: null,
    now: NOW,
  });
  assert.deepEqual(out, {});
});

test("expires tepat di waktu sekarang → dibuang (batas inklusif)", () => {
  const out = resolveToken({
    token,
    row: { expires: new Date(NOW).toISOString(), users: { role: "user", status: "active" } },
    rowError: null,
    now: NOW,
  });
  assert.deepEqual(out, {}, "expires <= now harus dianggap kedaluwarsa");
});

test("error DB → fail-closed (klaim dibuang), bukan sesi tetap hidup", () => {
  const out = resolveToken({
    token,
    row: { expires: FUTURE, users: { role: "admin", status: "active" } },
    rowError: { message: "fetch failed" },
    now: NOW,
  });
  assert.deepEqual(out, {}, "outage DB tidak boleh mempertahankan sesi yang mungkin sudah direvoke");
});

test("user suspended → klaim dibuang", () => {
  const out = resolveToken({
    token,
    row: { expires: FUTURE, users: { role: "user", status: "suspended" } },
    rowError: null,
    now: NOW,
  });
  assert.deepEqual(out, {});
});

test("join users berupa array → elemen pertama dipakai", () => {
  const out = resolveToken({
    token,
    row: { expires: FUTURE, users: [{ role: "admin", status: "active" }] },
    rowError: null,
    now: NOW,
  });
  assert.equal(out.role, "admin");
});

test("join users kosong/null → token dipertahankan apa adanya (sesi tetap sah)", () => {
  const out = resolveToken({
    token,
    row: { expires: FUTURE, users: null },
    rowError: null,
    now: NOW,
  });
  assert.equal(out.uid, "user-1", "relasi users tidak ada bukan alasan logout");
  assert.equal(out.role, "user", "role lama tidak berubah");
});

test("users tanpa status → tidak dianggap suspended", () => {
  const out = resolveToken({
    token,
    row: { expires: FUTURE, users: { role: "admin" } },
    rowError: null,
    now: NOW,
  });
  assert.equal(out.role, "admin");
});
