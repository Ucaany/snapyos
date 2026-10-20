/**
 * Update parsial voucher/promo — audit lintas-potong.
 * Patch `{ amount }` tanpa `type` tidak boleh melewati invariant percentage.
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  adminPromoUpdateSchema,
  discountAmountError,
  promoInvariantError,
  voucherInvariantError,
} from "../src/lib/validators.ts";

const root = new URL("../", import.meta.url);

test("discountAmountError: percentage dibatasi 100, fixed bebas", () => {
  assert.equal(discountAmountError("percentage", 100), null);
  assert.equal(discountAmountError("percentage", 500), "Diskon persen maksimal 100");
  assert.equal(discountAmountError("fixed", 500), null);
  assert.equal(discountAmountError(undefined, 500), null);
  assert.equal(discountAmountError("percentage", 0), "Nilai diskon harus > 0");
  assert.equal(discountAmountError("fixed", 1.5), "Nilai diskon harus > 0");
});

test("voucherInvariantError: amount > 100 pada row percentage yang tersimpan ditolak", () => {
  const current = {
    type: "percentage",
    amount: 10,
    start_date: null,
    end_date: null,
    min_transaction: 0,
    max_discount: null,
  };
  const issues = voucherInvariantError(current, { amount: 500 });
  assert.equal(issues.length, 1);
  assert.equal(issues[0]!.path[0], "amount");
  assert.equal(issues[0]!.message, "Diskon persen maksimal 100");
  // Patch sah tetap lolos.
  assert.deepEqual(voucherInvariantError(current, { amount: 50 }), []);
  // Ganti ke fixed + amount besar tetap sah.
  assert.deepEqual(voucherInvariantError(current, { type: "fixed", amount: 500 }), []);
});

test("voucherInvariantError: rentang tanggal dan min/max divalidasi setelah merge", () => {
  const current = {
    type: "fixed",
    amount: 5000,
    start_date: "2026-01-01T00:00:00.000Z",
    end_date: "2026-02-01T00:00:00.000Z",
    min_transaction: 0,
    max_discount: null,
  };
  const dateIssues = voucherInvariantError(current, {
    start_date: "2026-03-01T00:00:00.000Z",
  });
  assert.equal(dateIssues[0]!.path[0], "start_date");

  const minMaxIssues = voucherInvariantError(
    { ...current, max_discount: 10_000 },
    { min_transaction: 20_000 }
  );
  assert.equal(minMaxIssues[0]!.path[0], "min_transaction");
});

test("promoInvariantError: type tersimpan percentage + amount besar ditolak", () => {
  const current = {
    type: "percentage",
    amount: 20,
    start_date: null,
    end_date: null,
  };
  assert.equal(promoInvariantError(current, { amount: 500 })[0]!.message, "Persentase 1–100");
  assert.deepEqual(promoInvariantError(current, { amount: 80 }), []);
  assert.deepEqual(promoInvariantError(current, { type: "fixed", amount: 500 }), []);
});

test("adminPromoUpdateSchema: patch parsial tetap menerima amount tanpa type", () => {
  // Schema partial memang membolehkan; invariant dipaksakan di service (merge).
  assert.equal(adminPromoUpdateSchema.safeParse({ amount: 500 }).success, true);
});

test("service voucher/promo menerapkan invariant terhadap row tersimpan", async () => {
  const vouchers = await readFile(new URL("src/server/vouchers.ts", root), "utf8");
  assert.match(vouchers, /voucherInvariantError/);
  assert.match(
    vouchers,
    /select\("type, amount, start_date, end_date, min_transaction, max_discount"\)/
  );

  const promos = await readFile(new URL("src/server/admin/promos.ts", root), "utf8");
  assert.match(promos, /promoInvariantError/);
  assert.match(promos, /select\("type, amount, start_date, end_date"\)/);
});
