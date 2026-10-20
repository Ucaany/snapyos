/**
 * Struk POS ESC/POS — layout kolom, format uang, dan byte job.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildReceiptBlocks,
  encodeReceipt,
  fitText,
  formatReceiptMoney,
  receiptColumns,
  receiptDoubleColumns,
  receiptLine,
  type ReceiptData,
} from "../src/lib/print/receipt.ts";

const data: ReceiptData = {
  businessName: "Klik Foto Dev",
  orderNumber: "POS-20261020-0001",
  methodLabel: "TUNAI",
  boothName: "Booth 02",
  outletName: "Outlet Grand Senja",
  cashierName: "Owner",
  paidAt: "20/10/26, 19.27",
  items: [
    { name: "Kacamata", quantity: 1, unitPrice: 15000, subtotal: 15000 },
    { name: "Cetak Foto", quantity: 2, unitPrice: 5000, subtotal: 10000 },
  ],
  grossAmount: 25000,
  discountAmount: 5000,
  finalAmount: 20000,
};

test("kolom struk: 32 untuk 58mm, 48 untuk 80mm", () => {
  assert.equal(receiptColumns(58), 32);
  assert.equal(receiptColumns(80), 48);
  assert.equal(receiptDoubleColumns(58), 16);
  assert.equal(receiptDoubleColumns(80), 24);
});

test("format uang integer IDR memakai titik ribuan", () => {
  assert.equal(formatReceiptMoney(0), "Rp 0");
  assert.equal(formatReceiptMoney(15000), "Rp 15.000");
  assert.equal(formatReceiptMoney(1234567), "Rp 1.234.567");
  assert.equal(formatReceiptMoney(-2500), "-Rp 2.500");
  assert.equal(formatReceiptMoney(1500.9), "Rp 1.500");
});

test("fitText memotong ke kolom dengan elipsis ASCII", () => {
  assert.equal(fitText("SHORT", 10), "SHORT");
  assert.equal(fitText("ABCDEFGHIJK", 8), "ABCDE...");
  assert.equal(fitText("ABC", 0), "");
});

test("receiptLine menaruh nilai di kanan dan tidak melewati lebar", () => {
  const line = receiptLine("SUBTOTAL", "Rp 15.000", 32);
  assert.equal(line.length, 1);
  assert.equal(line[0]!.length, 32);
  assert.ok(line[0]!.startsWith("SUBTOTAL"));
  assert.ok(line[0]!.endsWith("Rp 15.000"));

  const narrow = receiptLine("NAMA PRODUK YANG SANGAT PANJANG", "Rp 1.234.567", 20);
  assert.ok(narrow.length >= 1);
  assert.ok(narrow.every((row) => row.length <= 20));
});

test("struk memuat identitas, item, total, dan perintah potong", () => {
  const blocks = buildReceiptBlocks(data, 58);
  const texts = blocks.filter((b) => b.kind === "text").map((b) => b.text);
  assert.ok(texts.includes("KLIK FOTO DEV"));
  assert.ok(texts.includes("STRUK PENJUALAN POS"));
  assert.ok(texts.some((t) => t.includes("POS-20261020-0001")));
  assert.ok(texts.some((t) => t.includes("KACAMATA")));
  assert.ok(texts.some((t) => t.startsWith("TOTAL") && t.includes("Rp 20.000")));
  assert.ok(texts.includes("TERIMA KASIH. SNAPYOS POS"));
  assert.equal(blocks.at(-1)?.kind, "cut");
  assert.ok(blocks.every((b) => b.kind !== "text" || b.text.length <= 32));
});

test("setiap blok teks muat secara fisik setelah ukuran font diterapkan", () => {
  const longData: ReceiptData = {
    ...data,
    businessName: "KLIK FOTO DEV CABANG GRAND SENJA PALEMBANG",
    items: [
      {
        name: "CETAK FOTO UKURAN BESAR DENGAN NAMA SANGAT PANJANG",
        quantity: 12,
        unitPrice: 999999,
        subtotal: 11999988,
      },
    ],
    grossAmount: 11999988,
    discountAmount: 999999,
    finalAmount: 10999989,
  };

  for (const widthMm of [58, 80] as const) {
    const columns = receiptColumns(widthMm);
    const blocks = buildReceiptBlocks(longData, widthMm);
    for (const block of blocks) {
      if (block.kind !== "text") continue;
      const physicalColumns = block.text.length * (block.size ?? 1);
      assert.ok(
        physicalColumns <= columns,
        `${widthMm}mm: "${block.text}" = ${physicalColumns} kolom > ${columns}`
      );
    }
  }
});

test("nama bisnis 2x dipotong ke lebar efektif dan total tetap 1x", () => {
  const blocks = buildReceiptBlocks(
    { ...data, businessName: "KLIK FOTO DEV CABANG GRAND SENJA PALEMBANG" },
    58
  );
  const name = blocks.find((b) => b.kind === "text" && b.size === 2);
  assert.ok(name && name.kind === "text");
  assert.ok(name.text.length <= 16);
  assert.ok(name.text.endsWith("..."));

  const total = blocks.find((b) => b.kind === "text" && b.text.startsWith("TOTAL"));
  assert.ok(total && total.kind === "text");
  assert.equal(total.size, undefined);
  assert.equal(total.text.length, 32);
  assert.ok(total.text.endsWith("Rp 20.000"));
});

test("struk 80mm memakai 48 kolom", () => {
  const blocks = buildReceiptBlocks(data, 80);
  const texts = blocks.filter((b) => b.kind === "text").map((b) => b.text);
  assert.ok(texts.some((t) => t.length === 48 && /^-+$/.test(t)));
  assert.ok(texts.every((t) => t.length <= 48));
});

test("job struk diawali ESC @ dan diakhiri cut parsial", () => {
  const bytes = encodeReceipt(data, 58);
  assert.deepEqual(Array.from(bytes.slice(0, 2)), [0x1b, 0x40]);
  assert.deepEqual(Array.from(bytes.slice(-6)), [0x1b, 0x64, 3, 0x1d, 0x56, 0x01]);
  const text = String.fromCharCode(...bytes);
  assert.ok(text.includes("Rp 20.000"));
  assert.ok(text.includes("Rp 5.000"));
});

test("item tanpa booth/outlet/kasir tidak mencetak label kosong", () => {
  const blocks = buildReceiptBlocks(
    { ...data, boothName: null, outletName: null, cashierName: null },
    58
  );
  const texts = blocks.filter((b) => b.kind === "text").map((b) => b.text);
  assert.ok(!texts.some((t) => /^Booth\s*$/.test(t)));
  assert.ok(!texts.some((t) => /^Outlet\s*$/.test(t)));
  assert.ok(!texts.some((t) => /^Kasir\s*$/.test(t)));
});

test("nominal besar tetap muat satu baris 32 kolom", () => {
  const blocks = buildReceiptBlocks(
    { ...data, grossAmount: 999999999, discountAmount: 0, finalAmount: 999999999 },
    58
  );
  const texts = blocks.filter((b) => b.kind === "text").map((b) => b.text);
  const total = texts.find((t) => t.startsWith("TOTAL"));
  assert.ok(total);
  assert.ok(total!.length <= 32);
  assert.ok(total!.includes("Rp 999.999.999"));
});
