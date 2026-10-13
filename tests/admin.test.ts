/**
 * Admin platform unit checks — docs/10 (MRR, payment summary, extend periode,
 * schema admin). Run: npm test
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  extendIsoDays,
  monthlyEquivalent,
  paymentSummary,
  sumMrr,
} from "../src/lib/admin-math.ts";
import {
  adminSettingsUpdateSchema,
  adminSubscriptionAddOnUpdateSchema,
  adminSubscriptionUpdateSchema,
  adminUserCreateSchema,
  adminUserUpdateSchema,
} from "../src/lib/validators.ts";

// --- MRR (docs/10 §10.1) ---
test("monthlyEquivalent: monthly-only — selalu pakai price_monthly", () => {
  assert.equal(monthlyEquivalent({ price_monthly: 99000 }), 99000);
  assert.equal(monthlyEquivalent({ price_monthly: 249000 }), 249000);
});

test("sumMrr: hanya subscription ber-plan yang dihitung", () => {
  assert.equal(
    sumMrr([
      { plan: { price_monthly: 99000 } },
      { plan: { price_monthly: 249000 } },
      { plan: null },
    ]),
    348000
  );
  assert.equal(sumMrr([]), 0);
});

// --- Payment summary (docs/10 §10.3) ---
test("paymentSummary: volume/counts/gross-fee-net/provider", () => {
  const fees = new Map([
    ["biz-1", { percent: 2, flat: 0 }],
    ["biz-2", { percent: 0, flat: 500 }],
  ]);
  const s = paymentSummary(
    [
      { business_id: "biz-1", final_amount: 100000, status: "paid", provider: "pakasir" },
      { business_id: "biz-1", final_amount: 50000, status: "paid", provider: "pakasir" },
      { business_id: "biz-2", final_amount: 20000, status: "paid", provider: "cash" },
      { business_id: "biz-1", final_amount: 30000, status: "pending", provider: "pakasir" },
      { business_id: "biz-1", final_amount: 10000, status: "refunded", provider: "pakasir" },
      { business_id: "biz-2", final_amount: 1, status: "failed", provider: "cash" },
    ],
    fees
  );
  // volume = 100000+50000+20000 = 170000
  assert.equal(s.volume, 170000);
  assert.equal(s.gross, 170000);
  // fee biz-1 = floor(150000*2/100) = 3000; biz-2 = 500 → net = 170000-3500
  assert.equal(s.fee, 3500);
  assert.equal(s.net, 166500);
  assert.equal(s.refunded, 10000);
  assert.equal(s.counts.paid, 3);
  assert.equal(s.counts.pending, 1);
  assert.equal(s.counts.failed, 1);
  assert.equal(s.counts.refunded, 1);
  assert.equal(s.byProvider[0]!.provider, "pakasir");
  assert.equal(s.byProvider[0]!.count, 4);
});

test("paymentSummary: fee tidak melebihi final_amount", () => {
  const s = paymentSummary(
    [{ business_id: "b", final_amount: 100, status: "paid", provider: "x" }],
    new Map([["b", { percent: 100, flat: 99999 }]])
  );
  assert.equal(s.fee, 100);
  assert.equal(s.net, 0);
});

// --- extendIsoDays (docs/10 §10.2 perpanjang) ---
test("extendIsoDays: dari periode habis / null, selalu maju dari sekarang", () => {
  const past = "2020-01-01T00:00:00.000Z";
  const iso = extendIsoDays(past, 30);
  assert.ok(new Date(iso).getTime() >= Date.now() + 29 * 86_400_000);
  assert.equal(extendIsoDays(null, 1), extendIsoDays(undefined, 1));
});

// --- Schema admin ---
test("adminUserUpdateSchema: minimal satu field, status/role valid", () => {
  assert.deepEqual(adminUserUpdateSchema.parse({ status: "suspended" }), { status: "suspended" });
  assert.deepEqual(adminUserUpdateSchema.parse({ role: "admin" }), { role: "admin" });
  assert.equal(adminUserUpdateSchema.safeParse({}).success, false);
  assert.equal(adminUserUpdateSchema.safeParse({ status: "banned" }).success, false);
});

test("adminUserCreateSchema: role default user, email dinormalkan, password min 8", () => {
  assert.deepEqual(
    adminUserCreateSchema.parse({ name: "Budi", email: "BUDI@klik.id", password: "rahasia99" }),
    { name: "Budi", email: "budi@klik.id", password: "rahasia99", role: "user" }
  );
  assert.equal(adminUserCreateSchema.parse({ name: "A", email: "a@b.id", password: "12345678", role: "admin" }).role, "admin");
  assert.equal(adminUserCreateSchema.safeParse({ name: "A", email: "a@b.id", password: "pendek" }).success, false);
  assert.equal(adminUserCreateSchema.safeParse({ name: "A", email: "bukan-email", password: "12345678" }).success, false);
  assert.equal(adminUserCreateSchema.safeParse({ name: "A", email: "a@b.id", password: "12345678", role: "ceo" }).success, false);
});

test("adminSettingsUpdateSchema: whitelist + uang integer", () => {
  assert.deepEqual(adminSettingsUpdateSchema.parse({ trial_days: 30 }), { trial_days: 30 });
  assert.equal(adminSettingsUpdateSchema.safeParse({ trial_days: 1.5 }).success, false);
  assert.equal(adminSettingsUpdateSchema.safeParse({ unknown_key: 1 }).success, false);
  assert.equal(adminSettingsUpdateSchema.safeParse({}).success, false);
});

test("adminSubscriptionUpdateSchema: aksi tunggal atau kombinasi", () => {
  assert.deepEqual(adminSubscriptionUpdateSchema.parse({ extend_days: 30 }), { extend_days: 30 });
  assert.deepEqual(adminSubscriptionUpdateSchema.parse({ cancel: true }), { cancel: true });
  assert.deepEqual(adminSubscriptionUpdateSchema.parse({ status: "active", extend_days: 7 }), {
    status: "active",
    extend_days: 7,
  });
  assert.equal(adminSubscriptionUpdateSchema.safeParse({}).success, false);
});

test("adminSubscriptionAddOnUpdateSchema: quantity 1–100 integer, wajib", () => {
  assert.deepEqual(adminSubscriptionAddOnUpdateSchema.parse({ quantity: 3 }), { quantity: 3 });
  assert.equal(adminSubscriptionAddOnUpdateSchema.safeParse({}).success, false);
  assert.equal(adminSubscriptionAddOnUpdateSchema.safeParse({ quantity: 0 }).success, false);
  assert.equal(adminSubscriptionAddOnUpdateSchema.safeParse({ quantity: 101 }).success, false);
  assert.equal(adminSubscriptionAddOnUpdateSchema.safeParse({ quantity: 2.5 }).success, false);
});

// ---------------------------------------------------------------------------
// M2 (security) — guard admin ada di LAPISAN ROUTE (adminRoute/adminRawRoute),
// bukan bergantung pada callee kebetulan memanggil requireAdmin.
// ---------------------------------------------------------------------------

async function adminRouteFiles(): Promise<string[]> {
  const rootDir = fileURLToPath(new URL("../src/app/api/v1/admin/", import.meta.url));
  const out: string[] = [];
  async function walk(dir: string) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) await walk(p);
      else if (entry.name === "route.ts") out.push(p);
    }
  }
  await walk(rootDir);
  return out;
}

test("M2: semua route /api/v1/admin/* memakai adminRoute/adminRawRoute", async () => {
  const files = await adminRouteFiles();
  assert.ok(files.length >= 20, `expected many admin routes, got ${files.length}`);
  const bad: string[] = [];
  for (const f of files) {
    const src = await readFile(f, "utf8");
    const usesAdmin = /adminRawRoute|adminRoute/.test(src);
    const usesApiRoute = /\bapiRoute\b/.test(src);
    if (!usesAdmin || usesApiRoute) bad.push(f.replace(process.cwd(), ""));
  }
  assert.deepEqual(bad, [], `route admin tanpa adminRoute/adminRawRoute: ${bad.join(", ")}`);
});

test("M2: GET subscriptions/:id & PATCH subscription-add-ons/:id tersedia (docs/10 §10.2)", async () => {
  const subRoute = await readFile(
    new URL("../src/app/api/v1/admin/subscriptions/[id]/route.ts", import.meta.url),
    "utf8"
  );
  assert.match(subRoute, /export const GET = adminRawRoute/, "GET subscriptions/:id wajib ada");
  assert.match(subRoute, /export const PATCH = adminRawRoute/, "PATCH subscriptions/:id wajib ada");

  const linkRoute = await readFile(
    new URL("../src/app/api/v1/admin/subscription-add-ons/[id]/route.ts", import.meta.url),
    "utf8"
  );
  assert.match(linkRoute, /export const PATCH = adminRawRoute/, "PATCH subscription-add-ons/:id wajib ada");
  assert.match(linkRoute, /export const DELETE = adminRawRoute/, "DELETE subscription-add-ons/:id wajib ada");
});

test("M2: adminRoute memanggil requireAdmin di lapisan route", async () => {
  const src = await readFile(new URL("../src/lib/api-route.ts", import.meta.url), "utf8");
  assert.match(src, /export function adminRoute/, "adminRoute harus tersedia");
  assert.match(src, /requireAdmin\(\)/, "adminRoute harus memanggil requireAdmin");
  // apiRoute tanpa auth telah dihapus (dead code) — guard admin tidak boleh
  // bergantung pada wrapper tanpa guard.
  assert.doesNotMatch(src, /export function apiRoute/, "apiRoute tanpa auth sudah dihapus");
});
