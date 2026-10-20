/**
 * Helper live shell /staff (src/lib/staff-live.ts).
 * Kontrak: jam mengikuti zona bisnis (bukan WIB hardcoded), tz tak dikenal
 * tidak boleh melempar, dan angka elapsed/progres tidak pernah NaN.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  clockParts,
  elapsedMinutes,
  remainingMinutes,
  safeTimeZone,
  sessionProgressPct,
} from "../src/lib/staff-live.ts";

// 2026-10-14T13:58:00Z → 20:58 WIB / 21:58 WITA / 22:58 WIT.
const at = "2026-10-14T13:58:00.000Z";

test("clockParts: label zona ikut timezone bisnis, bukan selalu WIB", () => {
  assert.deepEqual(clockParts(at, "Asia/Jakarta"), { time: "20.58", zone: "WIB" });
  assert.deepEqual(clockParts(at, "Asia/Makassar"), { time: "21.58", zone: "WITA" });
  assert.deepEqual(clockParts(at, "Asia/Jayapura"), { time: "22.58", zone: "WIT" });
  assert.deepEqual(clockParts(at, "UTC"), { time: "13.58", zone: "UTC" });
});

test("clockParts: terima Date, ms, dan ISO string", () => {
  const ms = Date.parse(at);
  assert.deepEqual(clockParts(ms, "Asia/Jakarta"), clockParts(new Date(ms), "Asia/Jakarta"));
  assert.deepEqual(clockParts(at, "Asia/Jakarta"), clockParts(ms, "Asia/Jakarta"));
});

test("safeTimeZone: tz tak dikenal/kosong jatuh ke Asia/Jakarta, tidak melempar", () => {
  assert.equal(safeTimeZone("Asia/Makassar"), "Asia/Makassar");
  assert.equal(safeTimeZone("Not/AZone"), "Asia/Jakarta");
  assert.equal(safeTimeZone(""), "Asia/Jakarta");
  assert.equal(safeTimeZone(null), "Asia/Jakarta");
  assert.equal(safeTimeZone(undefined), "Asia/Jakarta");
  // Nilai rusak dari DB tidak boleh menjatuhkan seluruh halaman /staff.
  assert.doesNotThrow(() => clockParts(at, "Bogus/Zone"));
  assert.deepEqual(clockParts(at, "Bogus/Zone"), { time: "20.58", zone: "WIB" });
});

test("elapsedMinutes: membulatkan ke bawah, timestamp rusak → 0", () => {
  const now = Date.parse("2026-10-14T10:00:00.000Z");
  assert.equal(elapsedMinutes("2026-10-14T09:30:00.000Z", now), 30);
  assert.equal(elapsedMinutes("2026-10-14T09:59:01.000Z", now), 0);
  assert.equal(elapsedMinutes("bukan-tanggal", now), 0);
  // Sesi yang mulai di masa depan tidak menghasilkan elapsed negatif.
  assert.equal(elapsedMinutes("2026-10-14T11:00:00.000Z", now), 0);
});

test("remainingMinutes: null tanpa expires_at, 0 saat jendela sudah lewat", () => {
  const now = Date.parse("2026-10-14T10:05:00.000Z");
  assert.equal(remainingMinutes(null, now), null);
  assert.equal(remainingMinutes("bukan-tanggal", now), null);
  // Dibulatkan ke atas: 30 detik sisa tetap "1 MIN", bukan 0.
  assert.equal(remainingMinutes("2026-10-14T10:05:30.000Z", now), 1);
  assert.equal(remainingMinutes("2026-10-14T10:10:00.000Z", now), 5);
  // Sesi basi tidak menampilkan sisa negatif.
  assert.equal(remainingMinutes("2026-10-14T09:00:00.000Z", now), 0);
});

test("sessionProgressPct: null tanpa expires_at valid, 0–100 saat ada", () => {
  const start = "2026-10-14T10:00:00.000Z";
  const now = Date.parse("2026-10-14T10:05:00.000Z");
  assert.equal(sessionProgressPct(start, null, now), null);
  assert.equal(sessionProgressPct(start, "bukan-tanggal", now), null);
  // Jendela nol/terbalik → null, bukan pembagian nol.
  assert.equal(sessionProgressPct(start, start, now), null);
  assert.equal(sessionProgressPct(start, "2026-10-14T09:00:00.000Z", now), null);
  assert.equal(sessionProgressPct(start, "2026-10-14T10:10:00.000Z", now), 50);
  // Dijepit ke rentang 0–100 walau jam server bergeser.
  assert.equal(
    sessionProgressPct(start, "2026-10-14T10:10:00.000Z", Date.parse("2026-10-14T11:00:00.000Z")),
    100
  );
  assert.equal(
    sessionProgressPct(start, "2026-10-14T10:10:00.000Z", Date.parse("2026-10-14T09:00:00.000Z")),
    0
  );
});
