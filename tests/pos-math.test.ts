import assert from "node:assert/strict";
import { test } from "node:test";

import { computePosTotals, posDayKey, posDayRange, posOrderNumber } from "../src/lib/pos-math.ts";

test("computePosTotals: subtotal per item, gross multi item, final = gross − discount", () => {
  const t = computePosTotals([
    { unitPrice: 15_000, qty: 2 },
    { unitPrice: 35_000, qty: 1 },
  ]);
  assert.deepEqual(t, { gross: 65_000, discount: 0, final: 65_000 });
});

test("computePosTotals: discount hook terima nilai (v1 selalu 0 dari caller)", () => {
  const t = computePosTotals([{ unitPrice: 50_000, qty: 1 }], 5_000);
  assert.deepEqual(t, { gross: 50_000, discount: 5_000, final: 45_000 });
});

test("computePosTotals: discount melebihi gross di-clamp ke 0 (bukan negatif)", () => {
  const t = computePosTotals([{ unitPrice: 10_000, qty: 1 }], 99_000);
  assert.deepEqual(t, { gross: 10_000, discount: 99_000, final: 0 });
});

test("computePosTotals: qty besar tetap integer tanpa float", () => {
  const t = computePosTotals([{ unitPrice: 1_500, qty: 999 }]);
  assert.deepEqual(t, { gross: 1_498_500, discount: 0, final: 1_498_500 });
});

test("posDayKey: zona Asia/Jakarta — 17:00 UTC masih hari yang sama, 22:00 UTC ganti hari", () => {
  // 2026-08-27 17:00 UTC = 2026-08-28 00:00 WIB.
  assert.equal(posDayKey(new Date("2026-08-27T17:00:00Z")), "2026-08-28");
  // 2026-08-27 16:59 UTC = 2026-08-27 23:59 WIB.
  assert.equal(posDayKey(new Date("2026-08-27T16:59:00Z")), "2026-08-27");
});

test("posDayRange: rentang [start, end) UTC untuk satu hari WIB", () => {
  const { start, end } = posDayRange(new Date("2026-08-27T17:00:00Z"));
  assert.equal(start.toISOString(), "2026-08-27T17:00:00.000Z");
  assert.equal(end.toISOString(), "2026-08-28T17:00:00.000Z");
});

test("posOrderNumber: format POS-YYYYMMDD-#### dengan seq 4 digit", () => {
  assert.equal(posOrderNumber(1, new Date("2026-08-27T17:00:00Z")), "POS-20260828-0001");
  assert.equal(posOrderNumber(42, new Date("2026-08-27T10:00:00Z")), "POS-20260827-0042");
  assert.equal(posOrderNumber(9999, new Date("2026-08-27T10:00:00Z")), "POS-20260827-9999");
});
