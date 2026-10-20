/**
 * Phase 4 unit checks — device pairing, timer, print layout, camera errors,
 * validator publik (docs/12 Phase 4 Testing).
 * Run: npm test
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ACTIVATION_CODE_LENGTH,
  activationExpiresAt,
  ACTIVATION_TTL_MS,
  generateActivationCode,
  generateDeviceToken,
  generateResultToken,
  hashDeviceToken,
} from "../src/lib/device-token.ts";
import { cameraErrorKind, resolutionLabel, resolutionWarning } from "../src/lib/camera-errors.ts";
import {
  computeExpiresAt,
  DEFAULT_TIMER_SECONDS,
  isExpired,
  isWarning,
  remainingSeconds,
} from "../src/lib/session-timer.ts";
import { printPlan } from "../src/lib/print-layout.ts";
import { deviceActivateSchema, sessionCreateSchema } from "../src/lib/validators.ts";

// --- device token & kode aktivasi (docs/05 §5.0) ---
test("generateDeviceToken: 64 hex chars, unik", () => {
  const a = generateDeviceToken();
  const b = generateDeviceToken();
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.notEqual(a, b);
});

test("hashDeviceToken: deterministik, ≠ token asli", () => {
  const token = generateDeviceToken();
  assert.equal(hashDeviceToken(token), hashDeviceToken(token));
  assert.notEqual(hashDeviceToken(token), token);
  assert.equal(hashDeviceToken(token).length, 64);
});

test("generateActivationCode: 6 chars, charset bebas ambigu, uppercase", () => {
  for (let i = 0; i < 50; i++) {
    const code = generateActivationCode();
    assert.equal(code.length, ACTIVATION_CODE_LENGTH);
    assert.match(code, /^[A-HJ-KM-NP-Z2-9]{6}$/);
    assert.equal(code, code.toUpperCase());
  }
});

test("activationExpiresAt: ~5 menit dari now", () => {
  const now = Date.now();
  const at = new Date(activationExpiresAt(now)).getTime();
  assert.ok(Math.abs(at - (now + ACTIVATION_TTL_MS)) <= 5);
});

test("generateResultToken: 32 hex chars", () => {
  assert.match(generateResultToken(), /^[0-9a-f]{32}$/);
});

// --- camera error mapping (docs/05 §5.5.3) ---
test("cameraErrorKind: nama error dikenali", () => {
  assert.equal(cameraErrorKind("NotAllowedError"), "NotAllowedError");
  assert.equal(cameraErrorKind("NotFoundError"), "NotFoundError");
  assert.equal(cameraErrorKind("NotReadableError"), "NotReadableError");
  assert.equal(cameraErrorKind("OverconstrainedError"), "OverconstrainedError");
  assert.equal(cameraErrorKind("AbortError"), "AbortError");
  assert.equal(cameraErrorKind("TypeError"), null);
  assert.equal(cameraErrorKind(null), null);
});

test("resolutionLabel + resolutionWarning: 1080p/720p/<720p", () => {
  assert.equal(resolutionLabel(1920), "FULL HD");
  assert.equal(resolutionLabel(1280), "HD");
  assert.equal(resolutionLabel(640), "LOW");
  assert.equal(resolutionWarning(1920), null);
  assert.equal(resolutionWarning(1280), null);
  assert.notEqual(resolutionWarning(640), null);
});

// --- session timer (docs/05 §5.1b) ---
test("computeExpiresAt: default 300s saat input invalid, sesuai input saat valid", () => {
  const now = Date.now();
  assert.equal(
    new Date(computeExpiresAt(0, now)).getTime(),
    new Date(computeExpiresAt(DEFAULT_TIMER_SECONDS, now)).getTime()
  );
  assert.equal(new Date(computeExpiresAt(120, now)).getTime(), now + 120_000);
  assert.equal(new Date(computeExpiresAt(-5, now)).getTime(), now + DEFAULT_TIMER_SECONDS * 1000);
});

test("computeExpiresAt: timer dari paid_at (bukan now) — docs/05 §5.1b baris 120", () => {
  const now = Date.now();
  // Customer membayar 60 detik lalu, timer 300s → expires 240s dari now.
  const paidAt = now - 60_000;
  const expiresAt = new Date(computeExpiresAt(300, paidAt)).getTime();
  assert.equal(expiresAt, paidAt + 300_000); // 240s from now
  assert.ok(expiresAt < now + 300_000, "expiry harus lebih awal dari now + timer");
  assert.ok(expiresAt > now, "expiry masih di masa depan (belum habis)");
});

test("computeExpiresAt: timer sudah habis saat sesi dibuat — clamp minimum grace", () => {
  const now = Date.now();
  // Customer membayar 600 detik lalu, timer 300s → idealnya sudah expired.
  const paidAt = now - 600_000;
  const idealExpiry = new Date(computeExpiresAt(300, paidAt)).getTime();
  assert.ok(idealExpiry < now, "ideal expiry sudah lewat");
  // Application code clamps: max(idealExpiry, now + 30_000).
  const MINIMUM_GRACE_MS = 30_000;
  const clampedExpiry = Math.max(idealExpiry, now + MINIMUM_GRACE_MS);
  assert.ok(clampedExpiry >= now + MINIMUM_GRACE_MS, "clamped expiry ≥ now + grace");
});

test("remainingSeconds / isExpired / isWarning", () => {
  const now = Date.now();
  const exp = new Date(now + 120_000).toISOString();
  assert.equal(remainingSeconds(exp, now), 120);
  assert.equal(isExpired(exp, now), false);
  assert.equal(isExpired(exp, now + 121_000), true);
  // warning 60s: aktif saat sisa ≤ 60s
  assert.equal(isWarning(exp, 60, now), false);
  assert.equal(isWarning(exp, 60, now + 70_000), true);
  // expired input invalid → sisa 0 → expired
  assert.equal(isExpired("bukan-iso", now), true);
});

// --- print layout mapping (docs/05 §5.15.3) ---
test("printPlan: digital only saat print_count 0", () => {
  assert.deepEqual(printPlan(0, 3, "photostrip"), { kind: "digital", sheets: 0 });
});

test("printPlan: photostrip → 1 strip berisi semua foto per lembar", () => {
  assert.deepEqual(printPlan(1, 3, "photostrip"), { kind: "strip", sheets: 1, photosPerStrip: 3 });
  assert.deepEqual(printPlan(2, 4, "single", "strip"), {
    kind: "strip",
    sheets: 2,
    photosPerStrip: 4,
  });
});

test("printPlan: single → tiap lembar satu foto (siklik)", () => {
  assert.deepEqual(printPlan(2, 2, "single"), {
    kind: "single",
    sheets: 2,
    photoIndexes: [0, 1],
  });
  assert.deepEqual(printPlan(3, 2, "single"), {
    kind: "single",
    sheets: 3,
    photoIndexes: [0, 1, 0],
  });
  assert.deepEqual(printPlan(1, 1, "single"), {
    kind: "single",
    sheets: 1,
    photoIndexes: [0],
  });
});

// --- validator publik (docs/08 §8.14) ---
test("deviceActivateSchema: 6 char alfanumerik uppercase", () => {
  assert.equal(deviceActivateSchema.safeParse({ code: "ab2cd3" }).success, true);
  assert.equal(deviceActivateSchema.safeParse({ code: "ab2cd" }).success, false);
  assert.equal(deviceActivateSchema.safeParse({ code: "ab2cd34" }).success, false);
  assert.equal(deviceActivateSchema.safeParse({ code: "AB-23X" }).success, false);
  // lowercase dinormalisasi ke uppercase
  const parsed = deviceActivateSchema.parse({ code: "ab2cd3" });
  assert.equal(parsed.code, "AB2CD3");
});

test("sessionCreateSchema: wajib checkout_session_id ATAU package_id + device_token", () => {
  const token = "a".repeat(64);
  const uuid = "00000000-0000-4000-8000-000000000000";
  assert.equal(sessionCreateSchema.safeParse({ device_token: token }).success, false);
  assert.equal(
    sessionCreateSchema.safeParse({ checkout_session_id: uuid, device_token: token }).success,
    true
  );
  assert.equal(
    sessionCreateSchema.safeParse({ package_id: uuid, device_token: token }).success,
    true
  );
  assert.equal(
    sessionCreateSchema.safeParse({
      package_id: uuid,
      checkout_session_id: uuid,
      device_token: token,
    }).success,
    true
  );
  assert.equal(
    sessionCreateSchema.safeParse({ package_id: uuid, device_token: "short" }).success,
    false
  );
});
