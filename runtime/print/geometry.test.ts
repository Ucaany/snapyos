import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mediaNameOf,
  placePrintImage,
  printGeometry,
  receiptGeometry,
} from "./geometry.ts";

test("printGeometry default 4x6 portrait", () => {
  assert.deepEqual(printGeometry({}), { widthMm: 101.6, heightMm: 152.4, marginMm: 0 });
});

test("orientation landscape menukar dimensi", () => {
  const geometry = printGeometry({ paper_size: "4x6", orientation: "landscape" });
  assert.equal(geometry.widthMm, 152.4);
  assert.equal(geometry.heightMm, 101.6);
});

test("strip 2-up memaksa 4x6 landscape", () => {
  const geometry = printGeometry({ paper_size: "4x6", strip_2up: true });
  assert.equal(geometry.widthMm, 152.4);
  assert.equal(geometry.heightMm, 101.6);
});

test("margin di-clamp 0-20", () => {
  assert.equal(printGeometry({ margins_mm: -5 }).marginMm, 0);
  assert.equal(printGeometry({ margins_mm: 99 }).marginMm, 20);
});

test("receiptGeometry hanya untuk 58/80mm", () => {
  assert.equal(receiptGeometry({ paper_width_mm: 58 })?.widthMm, 58);
  assert.equal(receiptGeometry({ paper_width_mm: 80 })?.widthMm, 80);
  assert.equal(receiptGeometry({ paper_width_mm: 44 }), null);
});

test("placePrintImage contain dan cover", () => {
  const contain = placePrintImage({
    boxX: 0,
    boxY: 0,
    boxWidth: 100,
    boxHeight: 50,
    imageWidth: 100,
    imageHeight: 100,
    fit: "contain",
  });
  assert.deepEqual(contain, { x: 25, y: 0, width: 50, height: 50 });

  const cover = placePrintImage({
    boxX: 0,
    boxY: 0,
    boxWidth: 100,
    boxHeight: 50,
    imageWidth: 100,
    imageHeight: 100,
    fit: "cover",
  });
  assert.deepEqual(cover, { x: 0, y: -25, width: 100, height: 100 });
});

test("mediaNameOf memakai override lalu fallback Custom", () => {
  const geometry = printGeometry({});
  assert.equal(mediaNameOf({ media_name: " DNP_4x6 " }, geometry), "DNP_4x6");
  assert.equal(mediaNameOf({}, geometry), "Custom.101.6x152.4mm");
});
