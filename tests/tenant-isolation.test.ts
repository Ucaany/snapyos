/**
 * Isolasi tenant — docs/03 §3.5–3.6, docs/09.
 *
 * `src/lib/tenant.ts` adalah satu-satunya gerbang scoping tenant (service-role
 * mem-bypass RLS), dipakai ~221 call-site. Sebelum tes ini TIDAK ADA berkas uji
 * yang mengimpornya, jadi regresi di sini tidak tertangkap apa pun.
 *
 * Yang diuji: cookie business aktif tidak boleh membocorkan tenant lain, dan
 * `getMembership` (gerbang 404 lintas tenant) harus menolak non-member.
 */

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

import { mockSupabase, eqPairs } from "./helpers/supabase-mock.mjs";

register("./tests/helpers/resolve-loader.mjs", pathToFileURL("./"));

const USER = "11111111-1111-4111-8111-111111111111";
const BIZ_A = "aaaaaaaa-1111-4111-8111-111111111111";
const BIZ_B = "bbbbbbbb-2222-4222-8222-222222222222";

type Tenant = typeof import("../src/lib/tenant.ts");
let tenant: Tenant;

const biz = (id: string, slug: string) => ({
  id,
  slug,
  name: `Bisnis ${slug}`,
  status: "active",
  timezone: "Asia/Jakarta",
  currency: "IDR",
});

/** Pasang stub global: cookies + supabase. */
function setup(opts: {
  memberships?: unknown[];
  membership?: unknown;
  membershipError?: unknown;
  cookie?: string;
  membershipsError?: unknown;
}) {
  globalThis.__COOKIES_STUB = {
    get: (name: string) =>
      name === "snapyos_active_business" && opts.cookie !== undefined
        ? { value: opts.cookie }
        : undefined,
  };
  globalThis.__SB_STUB = () =>
    mockSupabase({
      business_members: ({ steps }) => {
        // Query daftar (getUserMemberships) memakai `order`; query tunggal
        // (getMembership) memakai `maybeSingle`.
        const isSingle = steps.some((s) => s.method === "maybeSingle");
        if (isSingle) {
          return { data: opts.membership ?? null, error: opts.membershipError ?? null };
        }
        return { data: opts.memberships ?? [], error: opts.membershipsError ?? null };
      },
    });
}

before(async () => {
  tenant = await import("../src/lib/tenant.ts");
});

// --- getMembership: gerbang 404 lintas tenant -------------------------------

test("getMembership: non-member → null (dasar 404, bukan 403)", async () => {
  setup({ membership: null });
  assert.equal(await tenant.getMembership(USER, BIZ_A), null);
});

test("getMembership: member → business + role", async () => {
  setup({ membership: { role: "owner", businesses: biz(BIZ_A, "toko-a") } });
  const m = await tenant.getMembership(USER, BIZ_A);
  assert.equal(m?.role, "owner");
  assert.equal(m?.business.id, BIZ_A);
});

test("getMembership: query WAJIB memfilter user_id + business_id", async () => {
  let captured: Record<string, unknown> = {};
  globalThis.__COOKIES_STUB = { get: () => undefined };
  globalThis.__SB_STUB = () =>
    mockSupabase({
      business_members: ({ steps }) => {
        captured = eqPairs(steps);
        return { data: null, error: null };
      },
    });
  await tenant.getMembership(USER, BIZ_B);
  assert.equal(captured.user_id, USER, "harus memfilter user_id");
  assert.equal(captured.business_id, BIZ_B, "harus memfilter business_id");
});

test("getMembership: error DB → ApiError INTERNAL (fail-closed, bukan data kosong)", async () => {
  setup({ membershipError: { message: "boom" } });
  await assert.rejects(
    () => tenant.getMembership(USER, BIZ_A),
    (err: { code?: string }) => err.code === "INTERNAL"
  );
});

test("getMembership: relasi businesses berupa array → null (bukan crash)", async () => {
  setup({ membership: { role: "owner", businesses: [biz(BIZ_A, "toko-a")] } });
  assert.equal(await tenant.getMembership(USER, BIZ_A), null);
});

// --- getActiveBusinessForRoles: cookie tidak boleh lintas tenant -------------

test("cookie business tenant LAIN → jatuh ke membership pertama (tidak bocor)", async () => {
  setup({
    memberships: [
      { role: "owner", businesses: biz(BIZ_A, "toko-a") },
      { role: "manager", businesses: biz(BIZ_B, "toko-b") },
    ],
    cookie: "cccccccc-3333-4333-8333-333333333333", // bukan milik user
  });
  const active = await tenant.getActiveBusinessForRoles(USER, ["owner", "manager"]);
  assert.equal(active?.business.id, BIZ_A, "harus fallback, bukan menerima cookie asing");
});

test("cookie business milik user → dipakai", async () => {
  setup({
    memberships: [
      { role: "owner", businesses: biz(BIZ_A, "toko-a") },
      { role: "manager", businesses: biz(BIZ_B, "toko-b") },
    ],
    cookie: BIZ_B,
  });
  const active = await tenant.getActiveBusinessForRoles(USER, ["owner", "manager"]);
  assert.equal(active?.business.id, BIZ_B);
});

test("getActiveBusinessForRoles: role di luar allowlist disaring", async () => {
  setup({
    memberships: [
      { role: "staff", businesses: biz(BIZ_A, "toko-a") },
      { role: "manager", businesses: biz(BIZ_B, "toko-b") },
    ],
    cookie: BIZ_A, // cookie menunjuk business yang role-nya tidak diizinkan
  });
  const active = await tenant.getActiveBusinessForRoles(USER, ["owner", "manager"]);
  assert.equal(active?.business.id, BIZ_B, "cookie staff tidak boleh menang untuk shell manager");
});

test("getActiveBusinessForRoles: tanpa membership yang cocok → null", async () => {
  setup({ memberships: [{ role: "staff", businesses: biz(BIZ_A, "toko-a") }] });
  assert.equal(await tenant.getActiveBusinessForRoles(USER, ["owner"]), null);
});

test("getActiveBusiness: hanya role owner/manager/staff yang dipertimbangkan", async () => {
  setup({
    memberships: [{ role: "owner", businesses: biz(BIZ_A, "toko-a") }],
    cookie: BIZ_A,
  });
  const active = await tenant.getActiveBusiness(USER);
  assert.equal(active?.business.id, BIZ_A);
});

// --- getUserMemberships: normalisasi relasi ---------------------------------

test("getUserMemberships: baris tanpa relasi businesses dibuang", async () => {
  setup({
    memberships: [
      { role: "owner", businesses: null },
      { role: "owner", businesses: biz(BIZ_A, "toko-a") },
      { role: "manager", businesses: [biz(BIZ_B, "toko-b")] },
    ],
  });
  const list = await tenant.getUserMemberships(USER);
  assert.equal(list.length, 1, "hanya relasi objek tunggal yang valid");
  assert.equal(list[0]?.business.id, BIZ_A);
});

test("getUserMemberships: error DB → ApiError INTERNAL", async () => {
  setup({ membershipsError: { message: "boom" } });
  await assert.rejects(
    () => tenant.getUserMemberships(USER),
    (err: { code?: string }) => err.code === "INTERNAL"
  );
});
