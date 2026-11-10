import test from "node:test";
import assert from "node:assert/strict";

import {
  printPageSize,
  resolvePrintFit,
  PRINT_PAPER_MM,
  type PrintSettingsInput,
} from "../src/lib/print-layout.ts";
import {
  mediaNameOf,
  placePrintImage,
  printGeometry,
  receiptGeometry,
  resolveFit,
} from "../runtime/print/geometry.ts";

test("printPageSize: semua preset kertas portrait", () => {
  for (const [paper, mm] of Object.entries(PRINT_PAPER_MM)) {
    const page = printPageSize({ paper_size: paper as PrintSettingsInput["paper_size"] });
    assert.equal(page.widthMm, Math.min(mm.w, mm.h));
    assert.equal(page.heightMm, Math.max(mm.w, mm.h));
  }
  assert.deepEqual(
    {
      w: printPageSize({ paper_size: "2x6" }).widthMm,
      h: printPageSize({ paper_size: "2x6" }).heightMm,
    },
    { w: 50.8, h: 152.4 }
  );
  assert.equal(printPageSize({ paper_size: "5x7" }).widthMm, 127);
  assert.equal(printPageSize({ paper_size: "6x8" }).heightMm, 203.2);
});

test("printPageSize: landscape menukar dimensi", () => {
  const page = printPageSize({ paper_size: "4x6", orientation: "landscape" });
  assert.equal(page.widthMm, 152.4);
  assert.equal(page.heightMm, 101.6);
});

test("orientation auto mengikuti rasio kanvas", () => {
  const portrait = printPageSize({ paper_size: "4x6", orientation: "auto" }, 0.66);
  assert.ok(portrait.heightMm > portrait.widthMm);
  const landscape = printPageSize({ paper_size: "4x6", orientation: "auto" }, 1.5);
  assert.ok(landscape.widthMm > landscape.heightMm);
  // Fallback tanpa rasio = portrait.
  const fallback = printPageSize({ paper_size: "4x6", orientation: "auto" }, null);
  assert.ok(fallback.heightMm > fallback.widthMm);
});

test("strip_2up memaksa 4x6 landscape", () => {
  const page = printPageSize({ paper_size: "4x6", strip_2up: true });
  assert.equal(page.widthMm, 152.4);
  assert.equal(page.heightMm, 101.6);
});

test("runtime printGeometry sejalan dengan klien (preset + auto + 2up)", () => {
  assert.deepEqual(printGeometry({ paper_size: "2x6" }), {
    widthMm: 50.8,
    heightMm: 152.4,
    marginMm: 0,
  });
  assert.deepEqual(printGeometry({ paper_size: "5x7" }), {
    widthMm: 127,
    heightMm: 177.8,
    marginMm: 0,
  });
  assert.deepEqual(printGeometry({ paper_size: "4x6", orientation: "auto", canvas_aspect: 1.4 }), {
    widthMm: 152.4,
    heightMm: 101.6,
    marginMm: 0,
  });
  assert.deepEqual(printGeometry({ paper_size: "4x6", strip_2up: true }), {
    widthMm: 152.4,
    heightMm: 101.6,
    marginMm: 0,
  });
});

test("fit auto: frame & strip = contain, foto tunggal = cover", () => {
  assert.equal(resolvePrintFit("auto", { framed: true }), "contain");
  assert.equal(resolvePrintFit("auto", { framed: false, strip: true }), "contain");
  assert.equal(resolvePrintFit("auto", { framed: false, strip: false }), "cover");
  assert.equal(resolvePrintFit("contain", { framed: false }), "contain");
  assert.equal(resolvePrintFit("cover", { framed: true }), "cover");
  assert.equal(resolveFit("auto", { framed: true, strip: false }), "contain");
});

test("placePrintImage: contain letterbox, cover crop terpusat", () => {
  const contain = placePrintImage({
    boxX: 0,
    boxY: 0,
    boxWidth: 100,
    boxHeight: 100,
    imageWidth: 200,
    imageHeight: 100,
    fit: "contain",
  });
  assert.deepEqual(contain, { x: 0, y: 25, width: 100, height: 50 });

  const cover = placePrintImage({
    boxX: 0,
    boxY: 0,
    boxWidth: 100,
    boxHeight: 100,
    imageWidth: 200,
    imageHeight: 100,
    fit: "cover",
  });
  assert.deepEqual(cover, { x: -50, y: 0, width: 200, height: 100 });
});

test("mediaNameOf memakai override owner atau Custom.WxHmm", () => {
  const geometry = printGeometry({ paper_size: "4x6" });
  assert.equal(mediaNameOf({ media_name: "DNP_DS620_4x6" }, geometry), "DNP_DS620_4x6");
  assert.equal(mediaNameOf({}, geometry), "Custom.101.6x152.4mm");
});

test("receiptGeometry: hanya 58/80mm, tinggi mengikuti jumlah baris", () => {
  assert.equal(receiptGeometry({ paper_width_mm: 57 }), null);
  assert.equal(receiptGeometry({}), null);
  const narrow = receiptGeometry({ paper_width_mm: 58, lines: ["A", "B"] })!;
  const wide = receiptGeometry({ paper_width_mm: 80, lines: ["A", "B"] })!;
  assert.equal(narrow.widthMm, 58);
  assert.equal(wide.widthMm, 80);
  assert.equal(narrow.heightMm, wide.heightMm);
  assert.ok(
    receiptGeometry({ paper_width_mm: 80, lines: new Array(40).fill("X") })!.heightMm >
      wide.heightMm
  );
});
