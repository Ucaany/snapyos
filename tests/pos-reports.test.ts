import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildPosRevenue,
  buildPosProductBreakdown,
  buildPosLabelBreakdown,
  buildPosDayBreakdown,
  buildPosVsKioskSplit,
} from "../src/lib/pos-reports-math.ts";

/** docs/pos/05 §8 — agregasi campuran kiosk+POS, snapshot, split, day bucket. */

test("buildPosRevenue: totals + byMethod + byStatus + average (int IDR)", () => {
  const r = buildPosRevenue(
    [
      {
        gross_amount: 30_000,
        discount_amount: 5_000,
        final_amount: 25_000,
        payment_method: "cash",
      },
      { gross_amount: 20_000, discount_amount: 0, final_amount: 20_000, payment_method: "cash" },
      { gross_amount: 15_000, discount_amount: 0, final_amount: 15_000, payment_method: "other" },
    ],
    [
      { status: "paid" },
      { status: "paid" },
      { status: "paid" },
      { status: "cancelled" },
      { status: "voided" },
    ]
  );
  assert.equal(r.totalGross, 65_000);
  assert.equal(r.totalDiscount, 5_000);
  assert.equal(r.totalFinal, 60_000);
  assert.equal(r.count, 3);
  assert.equal(r.average, 20_000);
  assert.deepEqual(
    r.byMethod.map((m) => m.key),
    ["cash", "other"]
  );
  assert.equal(r.byMethod[0]!.amount, 45_000);
  assert.deepEqual(r.byStatus, [
    { key: "paid", count: 3 },
    { key: "cancelled", count: 1 },
    { key: "voided", count: 1 },
  ]);
});

test("buildPosRevenue: kosong → nol, tanpa NaN", () => {
  const r = buildPosRevenue([], []);
  assert.equal(r.totalFinal, 0);
  assert.equal(r.average, 0);
  assert.deepEqual(r.byMethod, []);
  assert.deepEqual(r.byStatus, []);
});

test("buildPosProductBreakdown: pakai name_snapshot (bukan nama produk sekarang), Σ qty + subtotal", () => {
  const rows = buildPosProductBreakdown([
    { name_snapshot: "Keychain Klasik", quantity: 2, subtotal: 40_000 },
    { name_snapshot: "Keychain Klasik", quantity: 1, subtotal: 20_000 },
    { name_snapshot: "Cetak 4R", quantity: 3, subtotal: 30_000 },
  ]);
  assert.deepEqual(rows, [
    { label: "Keychain Klasik", amount: 60_000, qty: 3 },
    { label: "Cetak 4R", amount: 30_000, qty: 3 },
  ]);
});

test("buildPosLabelBreakdown: join label di server, Σ final per label, urut desc", () => {
  const rows = buildPosLabelBreakdown([
    { label: "Booth A", final_amount: 50_000 },
    { label: "Booth B", final_amount: 70_000 },
    { label: "Booth A", final_amount: 10_000 },
  ]);
  assert.deepEqual(rows, [
    { label: "Booth B", amount: 70_000 },
    { label: "Booth A", amount: 60_000 },
  ]);
});

test("buildPosDayBreakdown: bucket hari UTC urut asc", () => {
  const rows = buildPosDayBreakdown([
    { paid_at: "2026-08-02T03:00:00Z", final_amount: 20_000 },
    { paid_at: "2026-08-01T10:00:00Z", final_amount: 15_000 },
    { paid_at: "2026-08-01T23:59:59Z", final_amount: 5_000 },
  ]);
  assert.deepEqual(rows, [
    { label: "2026-08-01", amount: 20_000 },
    { label: "2026-08-02", amount: 20_000 },
  ]);
});

test("buildPosVsKioskSplit: data campuran — pos_order_id not null = POS", () => {
  const s = buildPosVsKioskSplit([
    { pos_order_id: "ord-1", final_amount: 25_000 },
    { pos_order_id: null, final_amount: 100_000 },
    { pos_order_id: "ord-2", final_amount: 15_000 },
    { pos_order_id: null, final_amount: 50_000 },
  ]);
  assert.deepEqual(s, {
    pos: { final: 40_000, count: 2 },
    kiosk: { final: 150_000, count: 2 },
    total: { final: 190_000, count: 4 },
  });
});

test("buildPosVsKioskSplit: data pure-kiosk → pos nol (snapshot regression, docs/pos/05 §11.3)", () => {
  const s = buildPosVsKioskSplit([
    { pos_order_id: null, final_amount: 100_000 },
    { pos_order_id: null, final_amount: 50_000 },
  ]);
  assert.deepEqual(s.pos, { final: 0, count: 0 });
  assert.deepEqual(s.total, { final: 150_000, count: 2 });
});

test("buildPosVsKioskSplit: kosong → nol semua", () => {
  assert.deepEqual(buildPosVsKioskSplit([]), {
    pos: { final: 0, count: 0 },
    kiosk: { final: 0, count: 0 },
    total: { final: 0, count: 0 },
  });
});
