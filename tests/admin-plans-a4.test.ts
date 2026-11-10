/**
 * A4 Plans Management — regression checks (docs/10 §10.2, docs/16 A4).
 * - numDecimal() tidak boleh merusak nilai desimal platform_fee_percent.
 * - adminPlanCreateSchema menerima price_yearly + billing_cycle.
 * Run: npm test
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { num, numDecimal } from "../src/lib/form-state.ts";
import { adminPlanCreateSchema, adminPlanUpdateSchema } from "../src/lib/validators.ts";

function fd(entries: [string, string][]): FormData {
  const m = new Map(entries);
  return { get: (k: string) => (m.has(k) ? m.get(k)! : null) } as unknown as FormData;
}

test("num: IDR integer tetap membuang pemisah ribuan", () => {
  assert.equal(num(fd([["x", "1.500.000"]]), "x"), 1500000);
  assert.equal(num(fd([["x", "123000"]]), "x"), 123000);
  assert.equal(num(fd([["x", " 99 000 "]]), "x"), 99000);
});

test("num: input bertitik desimal DITOLAK (dulu 35000.9 → 350009)", () => {
  assert.throws(
    () => num(fd([["x", "35000.9"]]), "x"),
    (error: unknown) => {
      const issues = (error as { issues?: { path: PropertyKey[]; message: string }[] }).issues;
      assert.equal(issues?.[0]?.path[0], "x");
      assert.match(issues?.[0]?.message ?? "", /bulat tanpa desimal/);
      return true;
    }
  );
  assert.throws(() => num(fd([["x", "2.5"]]), "x"));
  assert.throws(() => num(fd([["x", "1,25"]]), "x"));
  // Pemisah ribuan yang sah tetap diterima.
  assert.equal(num(fd([["x", "1.500.000"]]), "x"), 1500000);
});

test("numDecimal: desimal platform_fee_percent tidak rusak (regresi 1.5→15)", () => {
  assert.equal(numDecimal(fd([["x", "1.5"]]), "x"), 1.5);
  assert.equal(numDecimal(fd([["x", "2.5"]]), "x"), 2.5);
  assert.equal(numDecimal(fd([["x", "0.5"]]), "x"), 0.5);
  assert.equal(numDecimal(fd([["x", "1,25"]]), "x"), 1.25);
  assert.equal(numDecimal(fd([["x", "100"]]), "x"), 100);
  assert.ok(Number.isNaN(numDecimal(fd([["x", ""]]), "x")));
});

test("adminPlanCreateSchema: price_yearly + billing_cycle opsional", () => {
  const ok = adminPlanCreateSchema.parse({
    code: "growth",
    name: "Growth",
    price_monthly: 249000,
    price_yearly: 2490000,
    billing_cycle: "yearly",
  });
  assert.equal(ok.price_yearly, 2490000);
  assert.equal(ok.billing_cycle, "yearly");

  const noYear = adminPlanCreateSchema.parse({ code: "s1", name: "S1", price_monthly: 0 });
  assert.equal(noYear.price_yearly, undefined);

  assert.equal(
    adminPlanCreateSchema.safeParse({
      code: "s1",
      name: "S1",
      price_monthly: 0,
      billing_cycle: "weekly",
    }).success,
    false
  );
});

test("adminPlanUpdateSchema: boleh ubah fee desimal + billing cycle", () => {
  const parsed = adminPlanUpdateSchema.parse({
    platform_fee_percent: 2.5,
    billing_cycle: "yearly",
  });
  assert.equal(parsed.platform_fee_percent, 2.5);
  assert.equal(parsed.billing_cycle, "yearly");
});
