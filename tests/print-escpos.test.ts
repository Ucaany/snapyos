/**
 * Encoder ESC/POS + dither + pemilihan mode cetak — pure, tanpa DOM.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  encodeEscPos,
  escAlign,
  escEmphasis,
  escInit,
  escTextSize,
  feed,
  gsRaster,
  gsRasterHeader,
  cut,
  sanitizeText,
} from "../src/lib/print/escpos.ts";
import { floydSteinberg, packMono, rgbaToGray, thresholdBitmap } from "../src/lib/print/dither.ts";
import {
  availablePrintPaths,
  bluetoothWidthDots,
  isPrintPathEnabled,
  resolvePrintMode,
  resolvePurposeSettings,
} from "../src/lib/print/print-mode.ts";
import { qrBitmap } from "../src/lib/print/qr.ts";
import { printPageSize, printSheets, printPlan } from "../src/lib/print-layout.ts";

test("command dasar sesuai byte ESC/POS", () => {
  assert.deepEqual(Array.from(escInit()), [0x1b, 0x40]);
  assert.deepEqual(Array.from(escAlign("left")), [0x1b, 0x61, 0]);
  assert.deepEqual(Array.from(escAlign("center")), [0x1b, 0x61, 1]);
  assert.deepEqual(Array.from(escAlign("right")), [0x1b, 0x61, 2]);
  assert.deepEqual(Array.from(escEmphasis(true)), [0x1b, 0x45, 1]);
  assert.deepEqual(Array.from(escEmphasis(false)), [0x1b, 0x45, 0]);
  assert.deepEqual(Array.from(escTextSize(2, 2)), [0x1d, 0x21, 0x11]);
  assert.deepEqual(Array.from(feed(3)), [0x1b, 0x64, 3]);
  assert.deepEqual(Array.from(cut(true)), [0x1d, 0x56, 1]);
  assert.deepEqual(Array.from(cut(false)), [0x1d, 0x56, 0]);
});

test("header raster GS v 0 menulis lebar byte dan tinggi", () => {
  assert.deepEqual(Array.from(gsRasterHeader(72, 128)), [0x1d, 0x76, 0x30, 0x00, 72, 0, 128, 0]);
  // 576 dot = 72 byte; tinggi 300 > 255 → high byte ikut terpakai.
  assert.deepEqual(Array.from(gsRasterHeader(72, 300)), [0x1d, 0x76, 0x30, 0x00, 72, 0, 44, 1]);
});

test("packMono: MSB = dot kiri, padding baris ke byte", () => {
  // 9 dot lebar → 2 byte per baris; dot 0 dan 8 hitam.
  const mono = new Uint8Array(18);
  mono[0] = 1;
  mono[8] = 1;
  const packed = packMono(mono, 9, 2);
  assert.equal(packed.data.length, 4);
  assert.equal(packed.data[0], 0b10000000);
  assert.equal(packed.data[1], 0b10000000);
});

test("thresholdBitmap memisahkan terang dan gelap", () => {
  const gray = new Uint8Array([0, 100, 127, 128, 200, 255]);
  const bitmap = thresholdBitmap(gray, 6, 1);
  // 0, 100, 127 < 128 → hitam (tiga bit kiri); sisanya putih.
  assert.equal(bitmap.data[0], 0b11100000);
});

test("floydSteinberg deterministik dan menangani semua-hitam/putih", () => {
  const allBlack = new Uint8Array(64).fill(0);
  const black = floydSteinberg(allBlack, 8, 8);
  assert.ok(black.data.every((b) => b === 0xff));

  const allWhite = new Uint8Array(64).fill(255);
  const white = floydSteinberg(allWhite, 8, 8);
  assert.ok(white.data.every((b) => b === 0));

  const gradient = Uint8Array.from({ length: 64 }, (_, i) => (i * 4) % 256);
  const first = floydSteinberg(gradient, 8, 8);
  const second = floydSteinberg(gradient, 8, 8);
  assert.deepEqual(Array.from(first.data), Array.from(second.data));
});

test("rgbaToGray memakai bobot Rec. 601", () => {
  const rgba = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]);
  const gray = rgbaToGray(rgba, 2, 1);
  assert.deepEqual(Array.from(gray), [255, 0]);
});

test("gsRaster memecah bitmap tinggi jadi perintah <= 128 baris", () => {
  const bitmap = { width: 8, height: 300, data: new Uint8Array(300) };
  const out = gsRaster(bitmap, 128);
  // 3 perintah: 128 + 128 + 44 baris; tiap header 8 byte + payload.
  let offset = 0;
  const heights: number[] = [];
  while (offset < out.length) {
    assert.equal(out[offset], 0x1d);
    assert.equal(out[offset + 1], 0x76);
    const rowBytes = out[offset + 4]! | (out[offset + 5]! << 8);
    const rows = out[offset + 6]! | (out[offset + 7]! << 8);
    heights.push(rows);
    offset += 8 + rowBytes * rows;
  }
  assert.deepEqual(heights, [128, 128, 44]);
});

test("sanitizeText membuang karakter non-ASCII dan mengganti simbol umum", () => {
  assert.equal(sanitizeText("4 × 6 · A6"), "4 x 6 - A6");
  assert.equal(sanitizeText("Harga ✓"), "Harga ");
  assert.equal(sanitizeText("Baris\nDua"), "Baris\nDua");
});

test("encodeEscPos menyusun job lengkap dengan init di depan", () => {
  const bitmap = { width: 8, height: 1, data: new Uint8Array([0b10000000]) };
  const job = encodeEscPos([
    { kind: "text", text: "UJI", align: "center", emphasis: true },
    { kind: "raster", bitmap },
    { kind: "cut", partial: true },
  ]);
  assert.deepEqual(Array.from(job.slice(0, 2)), [0x1b, 0x40]);
  // Teks "UJI\n" muncul sebagai ASCII.
  const text = String.fromCharCode(...job);
  assert.ok(text.includes("UJI\n"));
  // Cut parsial (GS V 1) ada di akhir setelah feed 3 baris.
  assert.deepEqual(Array.from(job.slice(-6)), [0x1b, 0x64, 3, 0x1d, 0x56, 0x01]);
});

test("QR menghasilkan bitmap persegi dengan quiet zone", () => {
  const bitmap = qrBitmap("https://example.com/r/abc123", 2, 2);
  assert.equal(bitmap.width, bitmap.height);
  assert.equal(bitmap.data.length, Math.ceil(bitmap.width / 8) * bitmap.height);
  // Quiet zone kiri-atas harus putih seluruhnya.
  const rowBytes = Math.ceil(bitmap.width / 8);
  assert.equal(bitmap.data[0], 0);
  assert.equal(bitmap.data[rowBytes - 1], 0);
});

test("mode cetak default browser untuk baris lama", () => {
  assert.equal(resolvePrintMode(null), "browser");
  assert.equal(resolvePrintMode({}), "browser");
  assert.equal(resolvePrintMode({ mode: "bluetooth" }), "bluetooth");
  assert.equal(bluetoothWidthDots(null), 576);
  assert.equal(bluetoothWidthDots({ bluetooth_paper_width_mm: 58 }), 384);
});

test("mode per purpose: grup menang, field datar jadi fallback", () => {
  const settings = {
    mode: "cups" as const,
    photo: { mode: "cups" as const },
    receipt: { mode: "bluetooth" as const },
    thermal: { enabled: true, paper_width_mm: 58 as const },
  };
  assert.equal(resolvePrintMode(settings, "photo"), "cups");
  assert.equal(resolvePrintMode(settings, "receipt"), "bluetooth");
  // Foto thermal selalu ESC/POS, bukan dialog OS.
  assert.equal(resolvePrintMode(settings, "thermal"), "bluetooth");
  // Baris lama tanpa grup tetap terbaca dari field datar.
  assert.equal(resolvePrintMode({ mode: "bluetooth" }, "receipt"), "bluetooth");
  assert.equal(bluetoothWidthDots(settings), 384);
});

test("gerbang enabled ditegakkan per jalur", () => {
  assert.equal(isPrintPathEnabled(null, "photo"), true);
  assert.equal(isPrintPathEnabled({ enabled: false }, "photo"), false);
  assert.equal(isPrintPathEnabled({ enabled: false, photo: { enabled: true } }, "photo"), false);
  assert.equal(isPrintPathEnabled({ photo: { enabled: false } }, "photo"), false);
  assert.equal(isPrintPathEnabled({ photo: { enabled: true } }, "photo"), true);
  // Thermal tanpa grup = jalur lama (mode datar), bukan default aktif.
  assert.equal(isPrintPathEnabled({ mode: "cups" }, "thermal"), false);
  assert.equal(isPrintPathEnabled({ mode: "bluetooth" }, "thermal"), true);
  assert.equal(isPrintPathEnabled({ thermal: { enabled: false } }, "thermal"), false);
  assert.equal(isPrintPathEnabled({ receipt: { enabled: false } }, "receipt"), false);
});

test("availablePrintPaths: dua jalur aktif bersamaan, urutan foto dulu", () => {
  const both = {
    photo: { enabled: true, mode: "cups" as const },
    thermal: { enabled: true, paper_width_mm: 58 as const },
  };
  assert.deepEqual(availablePrintPaths(both), ["photo", "thermal"]);
  assert.deepEqual(availablePrintPaths({ photo: { enabled: true }, thermal: { enabled: false } }), [
    "photo",
  ]);
  // Baris lama tanpa grup: hanya jalur datar yang dianggap tersedia.
  assert.deepEqual(availablePrintPaths({ mode: "cups" }), ["photo"]);
  assert.deepEqual(availablePrintPaths({ mode: "bluetooth" }), ["thermal"]);
  assert.deepEqual(availablePrintPaths({ enabled: false }), []);
});

test("resolvePurposeSettings: grup menimpa datar, sisanya tetap", () => {
  const settings = {
    paper_size: "4x6" as const,
    copies: 2,
    bluetooth_paper_width_mm: 80 as const,
    photo: { printer_name: "Kodak", margins_mm: 3 },
    receipt: { mode: "cups" as const, paper_width_mm: 58 as const },
  };
  const photo = resolvePurposeSettings(settings, "photo");
  assert.equal(photo.printer_name, "Kodak");
  assert.equal(photo.margins_mm, 3);
  assert.equal(photo.paper_size, "4x6");
  assert.equal(photo.copies, 2);
  const receipt = resolvePurposeSettings(settings, "receipt");
  assert.equal(receipt.mode, "cups");
  assert.equal(receipt.bluetooth_paper_width_mm, 58);
  assert.deepEqual(resolvePurposeSettings(null, "photo"), {});
});

test("printSheets: single menggilir foto, copies menggandakan lembar", () => {
  assert.deepEqual(printSheets(printPlan(2, 2, "single"), 2, 1), [[0], [1]]);
  assert.deepEqual(printSheets(printPlan(3, 2, "single"), 2, 1), [[0], [1], [0]]);
  assert.deepEqual(printSheets(printPlan(1, 1, "single"), 1, 2), [[0], [0]]);
});

test("printSheets: strip menumpuk semua foto dalam satu lembar", () => {
  const plan = printPlan(2, 3, "photostrip", "strip");
  assert.deepEqual(printSheets(plan, 3, 1), [
    [0, 1, 2],
    [0, 1, 2],
  ]);
});

test("printSheets: digital tidak menghasilkan lembar", () => {
  assert.deepEqual(printSheets(printPlan(0, 3, "single"), 3, 1), []);
  assert.deepEqual(printSheets(printPlan(2, 0, "single"), 0, 1), []);
});

test("frame composite 6-slot dengan print_count 2 menghasilkan 2 lembar yang sama", () => {
  const plan = printPlan(2, 1, "single");
  assert.deepEqual(printSheets(plan, 1, 1), [[0], [0]]);
});

test("printPageSize mengikuti ukuran kertas, orientasi, dan margin", () => {
  assert.deepEqual(printPageSize({ paper_size: "4x6", margins_mm: 3 }), {
    widthMm: 101.6,
    heightMm: 152.4,
    marginMm: 3,
  });
  assert.deepEqual(printPageSize({ paper_size: "A6", orientation: "landscape", margins_mm: 50 }), {
    widthMm: 148,
    heightMm: 105,
    marginMm: 20,
  });
});
