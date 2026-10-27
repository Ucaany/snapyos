/**
 * Phase 3 unit checks — plan limit enforcement + upload validation +
 * branding/outlet/photobox schema (docs/12 Phase 3 Testing).
 * Run: npm test
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_PLAN_LIMITS, planLimitError } from "../src/lib/plan-limits.ts";
import {
  LOGO_ALLOWED_TYPES,
  LOGO_MAX_BYTES,
  validateLogoFile,
} from "../src/lib/upload-validation.ts";
import {
  brandingSchema,
  kioskPageIdSchema,
  outletCreateSchema,
  outletUpdateSchema,
  photoboxCreateSchema,
  photoboxUpdateSchema,
} from "../src/lib/validators.ts";

// --- plan limit enforcement (server-side hitung count lalu cek) ---
test("planLimitError: count >= max → PLAN_LIMIT_REACHED", () => {
  assert.equal(planLimitError(0, 1), null);
  assert.equal(planLimitError(1, 1), "PLAN_LIMIT_REACHED");
  assert.equal(planLimitError(2, 1), "PLAN_LIMIT_REACHED");
  assert.equal(planLimitError(0, 0), "PLAN_LIMIT_REACHED"); // plan tanpa kuota
});

test("planLimitError menolak input non-integer/negatif (guard)", () => {
  assert.equal(planLimitError(1.5, 2), "PLAN_LIMIT_REACHED");
  assert.equal(planLimitError(1, -1), "PLAN_LIMIT_REACHED");
  assert.equal(planLimitError(NaN, 2), "PLAN_LIMIT_REACHED");
});

test("default plan starter 1/1", () => {
  assert.deepEqual(DEFAULT_PLAN_LIMITS, {
    max_outlets: 1,
    max_photoboxes: 1,
    max_concurrent_sessions: 1,
    max_staff: 0,
    max_packages: 50,
    max_templates: 20,
  });
});

// --- upload validation (logo) ---
test("validateLogoFile: allowlist tipe + ekstensi dari MIME (anti spoof)", () => {
  assert.deepEqual(validateLogoFile({ name: "l.png", type: "image/png", size: 1000 }), {
    ok: true,
    ext: "png",
  });
  // SVG dihapus dari allowlist logo (audit keamanan) → ditolak
  assert.equal(validateLogoFile({ name: "l.svg", type: "image/svg+xml", size: 100 }).ok, false);
  // .png tapi MIME pdf → ditolak
  assert.equal(
    validateLogoFile({ name: "evil.png", type: "application/pdf", size: 100 }).ok,
    false
  );
  assert.equal(validateLogoFile({ name: "x.gif", type: "image/gif", size: 100 }).ok, false);
  assert.equal(validateLogoFile({ name: null, type: "image/png", size: 100 }).ok, false);
});

test("validateLogoFile: size cap 2 MB + file kosong", () => {
  assert.equal(
    validateLogoFile({ name: "l.png", type: "image/png", size: LOGO_MAX_BYTES }).ok,
    true
  );
  assert.equal(
    validateLogoFile({ name: "l.png", type: "image/png", size: LOGO_MAX_BYTES + 1 }).ok,
    false
  );
  assert.equal(validateLogoFile({ name: "l.png", type: "image/png", size: 0 }).ok, false);
  assert.deepEqual(Object.keys(LOGO_ALLOWED_TYPES).sort(), [
    "image/jpeg",
    "image/png",
    "image/webp",
  ]);
});

// --- kiosk page id allowlist (anti injeksi key storage) ---
test("kioskPageIdSchema: hanya id layar sah yang lolos", () => {
  assert.equal(kioskPageIdSchema.safeParse("welcome").success, true);
  assert.equal(kioskPageIdSchema.safeParse("camera").success, false); // bukan id layar yang dikenal
  assert.equal(kioskPageIdSchema.safeParse("../../evil").success, false);
  assert.equal(kioskPageIdSchema.safeParse("welcome/../evil").success, false);
  assert.equal(kioskPageIdSchema.safeParse("").success, false);
});

// --- branding schema ---
test("brandingSchema: hex valid, panjang batas, logo_key nullable", () => {
  assert.equal(brandingSchema.safeParse({ primary_color: "#FFD400" }).success, true);
  assert.equal(brandingSchema.safeParse({ primary_color: "FFD400" }).success, false);
  assert.equal(brandingSchema.safeParse({ primary_color: "#ffd40" }).success, false);
  assert.equal(brandingSchema.safeParse({ welcome_button: "" }).success, false);
  assert.equal(brandingSchema.safeParse({ welcome_title: "A".repeat(121) }).success, false);
  assert.equal(brandingSchema.safeParse({ logo_key: null }).success, true);
  assert.equal(brandingSchema.safeParse({}).success, true);
});

// --- outlet schema ---
test("outletCreateSchema: nama wajib 2–80, status enum", () => {
  assert.equal(outletCreateSchema.safeParse({ name: "Malioboro" }).success, true);
  assert.equal(outletCreateSchema.safeParse({ name: "M" }).success, false);
  assert.equal(outletCreateSchema.safeParse({}).success, false);
  assert.equal(outletCreateSchema.safeParse({ name: "X Mall", status: "active" }).success, true);
  assert.equal(outletCreateSchema.safeParse({ name: "X Mall", status: "banned" }).success, false);
});

test("outletCreateSchema: wilayah province + city (nama dari API emsifa)", () => {
  // Nama API uppercase: { province: "DI YOGYAKARTA", city: "KOTA YOGYAKARTA" }
  assert.equal(
    outletCreateSchema.safeParse({
      name: "Malioboro",
      province: "DI YOGYAKARTA",
      city: "KOTA YOGYAKARTA",
    }).success,
    true
  );
  assert.equal(
    outletCreateSchema.safeParse({ name: "X", province: "P".repeat(81) }).success,
    false
  );
  assert.equal(outletUpdateSchema.safeParse({ province: null, city: null }).success, true);
});

// --- photobox schema ---
test("photoboxCreateSchema: slug pattern + outlet uuid wajib", () => {
  assert.equal(
    photoboxCreateSchema.safeParse({
      name: "Booth 01",
      outlet_id: "00000000-0000-4000-8000-000000000000",
    }).success,
    true
  );
  assert.equal(
    photoboxCreateSchema.safeParse({ name: "Booth 01", slug: "Booth 01" }).success,
    false
  );
  assert.equal(
    photoboxCreateSchema.safeParse({ name: "Booth 01", slug: "booth_01" }).success,
    false
  );
  assert.equal(photoboxCreateSchema.safeParse({ name: "Booth 01", slug: "bo" }).success, false);
  assert.equal(photoboxCreateSchema.safeParse({ name: "Booth 01" }).success, false); // tanpa outlet
  assert.equal(
    photoboxCreateSchema.safeParse({ name: "Booth 01", outlet_id: "not-uuid" }).success,
    false
  );
});

test("photoboxUpdateSchema: semua field opsional parsial", () => {
  assert.equal(photoboxUpdateSchema.safeParse({}).success, true);
  assert.equal(photoboxUpdateSchema.safeParse({ status: "maintenance" }).success, true);
  assert.equal(photoboxUpdateSchema.safeParse({ status: "broken" }).success, false);
  assert.equal(photoboxUpdateSchema.safeParse({ camera: null }).success, true);
});
