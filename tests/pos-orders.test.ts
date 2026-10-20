import assert from "node:assert/strict";
import { test } from "node:test";

import {
  classifyPosManualPay,
  computePosTotals,
  posDayRange,
  posOrderNumber,
} from "../src/lib/pos-math.ts";
import { posOrderCreateSchema, posManualPaySchema } from "../src/lib/validators.ts";
import { evaluatePosEntitlement } from "../src/lib/pos-entitlement.ts";
import {
  resolvePosReceiptSettings,
  shouldAutoPrintReceipt,
} from "../src/lib/pos-receipt-settings.ts";

/**
 * Unit murni logika order POS (docs/pos/03 §4 — jalur create/pay offline).
 * Pola repo: server file tipis (I/O), logika di src/lib — yang diuji di sini.
 * Kasus action negative ber-DB (scoping 404/403/409) tidak tercakup:
 * repo tidak punya harness integrasi DB (lihat docs/pos/08 §5).
 *
 * Atomicity (0026): payPosOrderManually sekarang memakai RPC pos_complete_payment
 * yang menjalankan UPDATE pos_orders + INSERT transactions dalam satu DB transaction.
 * Partial unique index idx_tx_pos_order_unique menjadi safety net duplikasi.
 * RPC hanya bisa diuji integrasi (butuh DB); unit test di bawah memverifikasi
 * kontrak input (schema) dan logika pure math yang dipakai sebelum RPC.
 */

const UUID = "123e4567-e89b-12d3-a456-426614174000";
const UUID2 = "123e4567-e89b-12d3-a456-426614174111";

// --- posOrderCreateSchema ----------------------------------------------------

test("order schema: qty 0 / negatif / 1000 / 999999 ditolak; qty 999 (batas atas) diterima", () => {
  for (const qty of [0, -1, 1000, 999999]) {
    assert.ok(
      !posOrderCreateSchema.safeParse({
        photoboxId: UUID,
        items: [{ productId: UUID2, qty }],
      }).success,
      `qty ${qty} harus ditolak`
    );
  }
  assert.ok(
    posOrderCreateSchema.safeParse({
      photoboxId: UUID,
      items: [{ productId: UUID2, qty: 999 }],
    }).success
  );
});

test("order schema: productId bukan uuid ditolak", () => {
  for (const productId of ["bukan-uuid", "123", "", 42]) {
    assert.ok(
      !posOrderCreateSchema.safeParse({
        photoboxId: UUID,
        items: [{ productId, qty: 1 }],
      }).success,
      `productId ${JSON.stringify(productId)} harus ditolak`
    );
  }
});

test("order schema: photoboxId wajib uuid; items kosong ditolak", () => {
  assert.ok(!posOrderCreateSchema.safeParse({ items: [{ productId: UUID2, qty: 1 }] }).success);
  assert.ok(!posOrderCreateSchema.safeParse({ photoboxId: UUID, items: [] }).success);
});

test("order schema: field total/harga dari client di-strip — tidak pernah masuk output (A8)", () => {
  // Zod object strip unknown key: payload `total` diabaikan, bukan error.
  // Properti keamanannya sama: nilai client tidak pernah sampai ke logika bisnis.
  const parsed = posOrderCreateSchema.parse({
    photoboxId: UUID,
    items: [{ productId: UUID2, qty: 1 }],
    total: 1,
    gross_amount: 1,
  });
  assert.equal(parsed.items.length, 1);
  assert.equal("total" in parsed, false);
  assert.equal("gross_amount" in parsed, false);
});

// --- posManualPaySchema ------------------------------------------------------

test("manual pay schema: qris DITOLAK (offline-only — A2)", () => {
  assert.ok(!posManualPaySchema.safeParse({ orderId: UUID, method: "qris" }).success);
});

test("manual pay schema: hanya cash | bank_transfer | other; orderId wajib uuid", () => {
  for (const method of ["cash", "bank_transfer", "other"]) {
    assert.ok(posManualPaySchema.safeParse({ orderId: UUID, method }).success);
  }
  for (const method of ["offline", "QRIS", "gopay", ""]) {
    assert.ok(!posManualPaySchema.safeParse({ orderId: UUID, method }).success);
  }
  assert.ok(!posManualPaySchema.safeParse({ orderId: "bukan-uuid", method: "cash" }).success);
});

// --- computePosTotals --------------------------------------------------------

test("computePosTotals: subtotal per item, gross = Σ subtotal", () => {
  const t = computePosTotals([
    { unitPrice: 25_000, qty: 3 }, // 75.000
    { unitPrice: 10_000, qty: 2 }, // 20.000
    { unitPrice: 5_000, qty: 1 }, //  5.000
  ]);
  assert.deepEqual(t, { gross: 100_000, discount: 0, final: 100_000 });
});

test("computePosTotals: discount di-cap (final tidak pernah negatif)", () => {
  const t = computePosTotals([{ unitPrice: 20_000, qty: 1 }], 50_000);
  assert.equal(t.gross, 20_000);
  assert.equal(t.final, 0);
});

test("computePosTotals: discount negatif di-clamp ke 0 (bukan menambah total)", () => {
  const t = computePosTotals([{ unitPrice: 20_000, qty: 1 }], -5_000);
  assert.deepEqual(t, { gross: 20_000, discount: 0, final: 20_000 });
});

test("computePosTotals: input pecahan di-trunc — tidak ada float di hasil", () => {
  const t = computePosTotals([{ unitPrice: 1_500.9, qty: 3.7 }]);
  // trunc(1500.9)=1500 × trunc(3.7)=3 → 4500, semua integer.
  assert.deepEqual(t, { gross: 4_500, discount: 0, final: 4_500 });
  assert.ok(Number.isInteger(t.gross) && Number.isInteger(t.final));
});

test("computePosTotals: qty max 999 × harga besar tetap aman integer", () => {
  const t = computePosTotals([{ unitPrice: 2_000_000_000, qty: 999 }]);
  assert.equal(t.gross, 1_998_000_000_000);
  assert.ok(Number.isInteger(t.gross));
});

test("computePosTotals: keranjang kosong = 0 (bukan error)", () => {
  assert.deepEqual(computePosTotals([]), { gross: 0, discount: 0, final: 0 });
});

// --- posOrderNumber ----------------------------------------------------------

test("posOrderNumber: format POS-YYYYMMDD-#### zona WIB", () => {
  // 2026-08-27T17:00Z = 2026-08-28 00:00 WIB → tanggal order = 2026-08-28.
  assert.equal(posOrderNumber(1, new Date("2026-08-27T17:00:00Z")), "POS-20260828-0001");
  // 2026-08-27T16:59Z = 2026-08-27 23:59 WIB → masih hari yang sama.
  assert.equal(posOrderNumber(7, new Date("2026-08-27T16:59:00Z")), "POS-20260827-0007");
});

test("posOrderNumber: seq di-pad 4 digit; seq < 1 dan pecahan dinormalisasi", () => {
  assert.equal(posOrderNumber(42, new Date("2026-08-27T10:00:00Z")), "POS-20260827-0042");
  assert.equal(posOrderNumber(9999, new Date("2026-08-27T10:00:00Z")), "POS-20260827-9999");
  assert.equal(posOrderNumber(0, new Date("2026-08-27T10:00:00Z")), "POS-20260827-0001");
  assert.equal(posOrderNumber(9.9, new Date("2026-08-27T10:00:00Z")), "POS-20260827-0009");
});

test("posOrderNumber: uniqueness reasoning — seq bertambah per order hari yang sama", () => {
  const noon = new Date("2026-08-27T05:00:00Z"); // 12:00 WIB
  const a = posOrderNumber(1, noon);
  const b = posOrderNumber(2, noon);
  assert.notEqual(a, b);
  // Ganti hari WIB → prefix tanggal berubah (uniq per business per hari via DB
  // unique(business_id, number) + retry-on-23505 di server pos-orders.ts).
  const nextDay = new Date("2026-08-28T05:00:00Z");
  assert.equal(posOrderNumber(1, nextDay), "POS-20260828-0001");
});

// --- posDayRange -------------------------------------------------------------

test("posDayRange: hari WIB = [17:00Z, 17:00Z+24h) sepanjang tahun (offset tetap +07)", () => {
  const { start, end } = posDayRange(new Date("2026-01-15T03:00:00Z"));
  assert.equal(start.toISOString(), "2026-01-14T17:00:00.000Z");
  assert.equal(end.toISOString(), "2026-01-15T17:00:00.000Z");
  const dec = posDayRange(new Date("2026-12-31T20:00:00Z")); // 2027-01-01 03:00 WIB
  assert.equal(dec.start.toISOString(), "2026-12-31T17:00:00.000Z");
  assert.equal(dec.end.toISOString(), "2027-01-01T17:00:00.000Z");
});

test("posDayRange: batas eksak — tepat 17:00Z masuk hari WIB berikutnya", () => {
  const { start } = posDayRange(new Date("2026-08-27T17:00:00Z"));
  assert.equal(start.toISOString(), "2026-08-27T17:00:00.000Z");
});

// --- evaluator entitlement (gate order) --------------------------------------

test("entitlement: hanya subscription trial|active|past_due + add-on pos aktif", () => {
  const posActive = { status: "active", addOnCode: "pos", addOnActive: true };
  assert.ok(evaluatePosEntitlement("trial", [posActive]));
  assert.ok(evaluatePosEntitlement("past_due", [posActive]));
  assert.ok(!evaluatePosEntitlement("expired", [posActive]));
  assert.ok(!evaluatePosEntitlement(null, [posActive]));
});

// --- setelan struk: lebar kertas + auto-print --------------------------------

test("struk: 58mm + bluetooth + auto_print true diteruskan", () => {
  const s = resolvePosReceiptSettings({
    mode: "bluetooth",
    bluetooth_paper_width_mm: 58,
    auto_print: true,
  });
  assert.equal(s.paperWidthMm, 58);
  assert.equal(s.printMode, "bluetooth");
  assert.equal(s.autoPrint, true);
});

test("struk: 80mm default, auto_print default aktif, mode browser", () => {
  const s = resolvePosReceiptSettings({ mode: "browser" });
  assert.equal(s.paperWidthMm, 80);
  assert.equal(s.printMode, "browser");
  assert.equal(s.autoPrint, true);
});

test("struk: auto_print=false dihormati (tidak auto-print)", () => {
  const s = resolvePosReceiptSettings({
    mode: "bluetooth",
    bluetooth_paper_width_mm: 80,
    auto_print: false,
  });
  assert.equal(s.autoPrint, false);
  assert.equal(shouldAutoPrintReceipt({ print_mode: s.printMode, auto_print: s.autoPrint }), false);
});

test("struk: tanpa booth → paper_width null dan mode browser", () => {
  const s = resolvePosReceiptSettings(null, false);
  assert.equal(s.paperWidthMm, null);
  assert.equal(s.printMode, "browser");
});

test("struk: auto-print hanya untuk jalur bluetooth", () => {
  assert.equal(shouldAutoPrintReceipt({ print_mode: "bluetooth", auto_print: true }), true);
  assert.equal(shouldAutoPrintReceipt({ print_mode: "browser", auto_print: true }), false);
  assert.equal(shouldAutoPrintReceipt({ print_mode: "bluetooth", auto_print: false }), false);
});

// --- idempotensi pembayaran manual -------------------------------------------

test("manual pay: transaksi existing menang atas status non-pending (retry RPC)", () => {
  assert.equal(
    classifyPosManualPay({ status: "paid", hasExistingTransaction: true }),
    "already-settled"
  );
  assert.equal(
    classifyPosManualPay({ status: "cancelled", hasExistingTransaction: true }),
    "already-settled"
  );
});

test("manual pay: non-pending tanpa transaksi tetap tidak bisa dibayar", () => {
  assert.equal(
    classifyPosManualPay({ status: "paid", hasExistingTransaction: false }),
    "not-payable"
  );
  assert.equal(
    classifyPosManualPay({ status: "cancelled", hasExistingTransaction: false }),
    "not-payable"
  );
});

test("manual pay: order pending tanpa transaksi → settle", () => {
  assert.equal(
    classifyPosManualPay({ status: "pending", hasExistingTransaction: false }),
    "settle"
  );
});
