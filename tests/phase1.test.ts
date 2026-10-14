/**
 * Phase 1 unit checks — node:test bawaan (tanpa framework).
 * Run: npm test (docs/12 Phase 1: unit auth/validators + RBAC).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { slugify, isValidSlug, RESERVED_SLUGS } from "../src/lib/slug.ts";
import { destinationFor, destinationForUser } from "../src/lib/destination.ts";
import { can, canUnchecked } from "../src/lib/rbac.ts";
import { rateLimit, registerFailure, resetLimit } from "../src/lib/rate-limit.ts";
import { API_ERRORS, ApiError, listEnvelope } from "../src/lib/api-errors.ts";
import {
  businessCreateSchema,
  loginSchema,
  normalizeWhatsapp,
  registerSchema,
} from "../src/lib/validators.ts";

// --- slug (docs/03 §3.3.1) ---
test("slugify membersihkan nama bisnis", () => {
  assert.equal(slugify("KLIK FOTO Yogya!"), "klik-foto-yogya");
  assert.equal(slugify("  Booth -- 01  "), "booth-01");
  assert.equal(slugify("Kafe Jöhn"), "kafe-john");
});

test("slug reserved route ditolak", () => {
  for (const slug of ["dashboard", "admin", "api", "p", "r"]) {
    assert.equal(isValidSlug(slug), false, `${slug} harus reserved`);
  }
  assert.equal(isValidSlug("klik-foto"), true);
  assert.equal(isValidSlug("ab"), false);
  assert.equal(isValidSlug("Klik-Foto"), false);
  assert.ok(RESERVED_SLUGS.includes("bantuan"));
});

// --- validators ---
test("registerSchema menolak input tidak valid", () => {
  assert.equal(registerSchema.safeParse({ name: "", email: "x@y.id", password: "12345678" }).success, false);
  assert.equal(registerSchema.safeParse({ name: "Budi", email: "bukan-email", password: "12345678" }).success, false);
  assert.equal(registerSchema.safeParse({ name: "Budi", email: "a@b.id", password: "short" }).success, false);
  const ok = registerSchema.safeParse({ name: " Budi ", email: " A@B.ID ", password: "panjangkan" });
  assert.equal(ok.success, true);
  if (ok.success) {
    assert.equal(ok.data.email, "a@b.id");
    assert.equal(ok.data.name, "Budi");
  }
});

test("loginSchema mewajibkan email + password", () => {
  assert.equal(loginSchema.safeParse({ email: "a@b.id", password: "" }).success, false);
  assert.equal(loginSchema.safeParse({ email: "a@b.id", password: "x" }).success, true);
});

// --- registration profile (0017) ---
test("registerSchema back-compat: field profil opsional", () => {
  assert.equal(
    registerSchema.safeParse({ name: "Budi", email: "a@b.id", password: "panjangkan" }).success,
    true
  );
  const rich = registerSchema.safeParse({
    name: "Budi",
    email: "a@b.id",
    password: "panjangkan",
    whatsapp: "08123456789",
    acquisition_source: "social_media",
    planned_devices: 3,
  });
  assert.equal(rich.success, true);
});

test("registerSchema menolak field profil tidak valid", () => {
  const base = { name: "Budi", email: "a@b.id", password: "panjangkan" };
  assert.equal(registerSchema.safeParse({ ...base, whatsapp: "12345" }).success, false);
  assert.equal(registerSchema.safeParse({ ...base, whatsapp: "+628123" }).success, false);
  assert.equal(registerSchema.safeParse({ ...base, acquisition_source: "tv" }).success, false);
  assert.equal(registerSchema.safeParse({ ...base, planned_devices: -1 }).success, false);
  assert.equal(registerSchema.safeParse({ ...base, planned_devices: 1.5 }).success, false);
  assert.equal(registerSchema.safeParse({ ...base, planned_devices: 1001 }).success, false);
});

test("normalizeWhatsapp menghasilkan format +62", () => {
  assert.equal(normalizeWhatsapp("08123456789"), "+628123456789");
  assert.equal(normalizeWhatsapp("628123456789"), "+628123456789");
  assert.equal(normalizeWhatsapp("+628123456789"), "+628123456789");
});

test("businessCreateSchema menerima slug opsional yang valid", () => {
  assert.equal(businessCreateSchema.safeParse({ name: "KLIK FOTO" }).success, true);
  assert.equal(businessCreateSchema.safeParse({ name: "KLIK FOTO", slug: "klik-foto" }).success, true);
  // slug dinormalisasi ke lowercase sebelum divalidasi (zod v4 chain)
  const normalized = businessCreateSchema.safeParse({ name: "KLIK FOTO", slug: "KLIK" });
  assert.equal(normalized.success, true);
  if (normalized.success) assert.equal(normalized.data.slug, "klik");
  assert.equal(businessCreateSchema.safeParse({ name: "KLIK FOTO", slug: "klik_foto" }).success, false);
  assert.equal(businessCreateSchema.safeParse({ name: "KLIK FOTO", slug: "ab" }).success, false);
  assert.equal(businessCreateSchema.safeParse({ name: "K" }).success, false);
});

// --- Routing pasca-login ---
const membership = (role: "owner" | "manager" | "staff") => ({ role });
const userMembership = (role: "owner" | "manager" | "staff") => membership(role);

test("destinationFor membedakan no-membership, staff-only, dan owner/manager", () => {
  assert.equal(destinationFor([]), "/welcome");
  assert.equal(destinationFor([membership("staff")]), "/staff");
  assert.equal(
    destinationFor([
      membership("staff"),
      membership("manager"),
    ]),
    "/dashboard"
  );
});

test("destinationForUser: admin menang, non-admin mengikuti membership", () => {
  assert.equal(destinationForUser([], { isAdmin: true }), "/admin");
  assert.equal(destinationForUser([userMembership("owner")], { isAdmin: false }), "/dashboard");
  assert.equal(destinationForUser([], { isAdmin: false }), "/welcome");
});

test("kontrak admin dipakai konsisten oleh guard, login, dan proxy", async () => {
  const { readFile } = await import("node:fs/promises");
  const root = new URL("../", import.meta.url);
  const guard = await readFile(new URL("src/server/admin/guard.ts", root), "utf8");
  const login = await readFile(new URL("src/app/(auth)/login/page.tsx", root), "utf8");
  const proxy = await readFile(new URL("src/proxy.ts", root), "utf8");
  assert.match(guard, /export function isAdminUser/);
  assert.match(guard, /role === "admin" \|\| isAdminEmail\(user\.email \?\? null\)/);
  assert.match(login, /isAdminUser\(user\)/);
  assert.match(proxy, /isAdminUser\(user\)/);
});

// --- RBAC (docs/09) ---
test("RBAC matrix: owner full, manager operasional, staff terbatas", () => {
  assert.equal(canUnchecked("owner", "anything:at:all"), true);
  assert.equal(can("manager", "business:update"), true);
  assert.equal(can("manager", "finance:read"), true);
  assert.equal(can("staff", "finance:read"), false);
  assert.equal(can("staff", "business:read"), true);
});

// --- rate limit (docs/08 §8.18, docs/09 §10) ---
test("rateLimit membatasi 5x/menit lalu menolak", async () => {
  const key = `test:ip:${Math.random()}`;
  for (let i = 0; i < 5; i++) {
    assert.equal((await rateLimit(key, 5, 60_000)).ok, true);
  }
  const blocked = await rateLimit(key, 5, 60_000);
  assert.equal(blocked.ok, false);
  assert.ok(blocked.retryAfterSec > 0);
});

test("registerFailure menghitung lockout dan resetLimit membersihkan", async () => {
  const key = `test:fail:${Math.random()}`;
  for (let i = 1; i <= 4; i++) assert.equal(await registerFailure(key, 60_000), i);
  await resetLimit(key);
  assert.equal(await registerFailure(key, 60_000), 1);
});

// --- error envelope (docs/08 §8.2) ---
test("ApiError memetakan kode ke HTTP status yang benar", () => {
  assert.equal(new ApiError("UNAUTHORIZED", "x").status, 401);
  assert.equal(new ApiError("SESSION_EXPIRED", "x").status, 410);
  assert.equal(new ApiError("SUBSCRIPTION_EXPIRED", "x").status, 410);
  assert.equal(new ApiError("PLAN_LIMIT_REACHED", "x").status, 422);
  assert.equal(new ApiError("RATE_LIMITED", "x").status, 429);
  assert.deepEqual(new ApiError("NOT_FOUND", "Business tidak ada").toBody(), {
    error: { code: "NOT_FOUND", message: "Business tidak ada", details: {} },
  });
});

test("listEnvelope menghitung totalPages", () => {
  const env = listEnvelope([1, 2, 3], 2, 3, 10);
  assert.equal(env.meta.totalPages, 4);
  assert.equal(env.meta.total, 10);
  assert.ok(Object.keys(API_ERRORS).length >= 17);
});
