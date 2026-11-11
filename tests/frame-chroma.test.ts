import { test } from "node:test";
import assert from "node:assert/strict";

import {
  connectedComponents,
  detectGreenSlots,
  greenMask,
  simplifyPolygon,
  traceContour,
} from "../src/lib/frame-chroma.ts";

const GREEN: [number, number, number] = [0, 200, 0];
const WHITE: [number, number, number] = [255, 255, 255];

/** Kanvas RGBA dengan blok hijau pada rect (inklusif). */
function makeImage(
  width: number,
  height: number,
  blocks: { x: number; y: number; w: number; h: number }[]
): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    rgba[i * 4] = WHITE[0];
    rgba[i * 4 + 1] = WHITE[1];
    rgba[i * 4 + 2] = WHITE[2];
    rgba[i * 4 + 3] = 255;
  }
  for (const b of blocks) {
    for (let y = b.y; y < b.y + b.h; y += 1) {
      for (let x = b.x; x < b.x + b.w; x += 1) {
        const p = (y * width + x) * 4;
        rgba[p] = GREEN[0];
        rgba[p + 1] = GREEN[1];
        rgba[p + 2] = GREEN[2];
        rgba[p + 3] = 255;
      }
    }
  }
  return rgba;
}

test("greenMask: hanya piksel hijau opaque ditandai", () => {
  const w = 4;
  const h = 1;
  const rgba = new Uint8ClampedArray([
    0,
    200,
    0,
    255, // hijau
    255,
    255,
    255,
    255, // putih
    0,
    200,
    0,
    0, // hijau transparan → bukan
    0,
    0,
    200,
    255, // biru → bukan
  ]);
  const mask = greenMask(rgba, w, h);
  assert.deepEqual([...mask], [1, 0, 0, 0]);
});

test("connectedComponents: dua blok terpisah = dua komponen", () => {
  const w = 40;
  const h = 20;
  const mask = new Uint8Array(w * h);
  for (let y = 2; y < 10; y += 1) for (let x = 2; x < 10; x += 1) mask[y * w + x] = 1;
  for (let y = 2; y < 10; y += 1) for (let x = 25; x < 33; x += 1) mask[y * w + x] = 1;
  const comps = connectedComponents(mask, w, h);
  assert.equal(comps.length, 2);
  assert.deepEqual(
    comps.map((c) => [c.minX, c.minY, c.maxX, c.maxY]),
    [
      [2, 2, 9, 9],
      [25, 2, 32, 9],
    ]
  );
});

test("traceContour: blok persegi menghasilkan batas luar saja", () => {
  const w = 20;
  const h = 20;
  const mask = new Uint8Array(w * h);
  for (let y = 5; y < 15; y += 1) for (let x = 5; x < 15; x += 1) mask[y * w + x] = 1;
  const [comp] = connectedComponents(mask, w, h);
  const contour = traceContour(mask, w, h, comp!);
  assert.ok(contour.length >= 4);
  for (const pt of contour) {
    assert.ok(pt.x >= 5 && pt.x <= 14, `x ${pt.x} di luar blok`);
    assert.ok(pt.y >= 5 && pt.y <= 14, `y ${pt.y} di luar blok`);
  }
});

test("detectGreenSlots: dua lubang persegi → 2 poligon bbox benar, z atas→bawah", () => {
  const w = 200;
  const h = 200;
  const rgba = makeImage(w, h, [
    { x: 20, y: 20, w: 40, h: 30 },
    { x: 20, y: 120, w: 40, h: 30 },
  ]);
  const result = detectGreenSlots(rgba, w, h, 400, 400, 8);
  assert.equal(result.skipped, 0);
  assert.equal(result.polygons.length, 2);

  const bbox = (points: { x: number; y: number }[]) => {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    return {
      left: Math.min(...xs),
      top: Math.min(...ys),
      right: Math.max(...xs),
      bottom: Math.max(...ys),
    };
  };

  const [first, second] = result.polygons;
  const b1 = bbox(first!.points);
  const b2 = bbox(second!.points);
  // Skala 2x dari piksel frame ke canvas; bbox ≈ 80x60 pada offset 40,40.
  assert.ok(Math.abs(b1.left - 40) <= 3, `left ${b1.left}`);
  assert.ok(Math.abs(b1.top - 40) <= 3, `top ${b1.top}`);
  assert.ok(Math.abs(b1.right - 120) <= 3, `right ${b1.right}`);
  assert.ok(Math.abs(b1.bottom - 100) <= 3, `bottom ${b1.bottom}`);
  assert.ok(b2.top > b1.top, "urutan z atas→bawah");
  assert.ok(Math.abs(b2.top - 240) <= 3, `top2 ${b2.top}`);
});

test("detectGreenSlots: blok di tepi kanvas tetap di dalam canvas", () => {
  const w = 100;
  const h = 100;
  const rgba = makeImage(w, h, [{ x: 0, y: 0, w: 40, h: 40 }]);
  const result = detectGreenSlots(rgba, w, h, 100, 100, 8);
  assert.equal(result.polygons.length, 1);
  for (const pt of result.polygons[0]!.points) {
    assert.ok(pt.x >= 0 && pt.x <= 100, `x ${pt.x}`);
    assert.ok(pt.y >= 0 && pt.y <= 100, `y ${pt.y}`);
  }
});

test("detectGreenSlots: komponen kecil diabaikan", () => {
  const w = 200;
  const h = 200;
  const rgba = makeImage(w, h, [
    { x: 10, y: 10, w: 40, h: 40 },
    { x: 120, y: 120, w: 4, h: 4 },
  ]);
  const result = detectGreenSlots(rgba, w, h, 200, 200, 8);
  assert.equal(result.polygons.length, 1);
});

test("detectGreenSlots: 10 komponen → 8 dipakai, skipped 2", () => {
  const w = 400;
  const h = 300;
  const blocks = Array.from({ length: 10 }, (_, i) => ({
    x: 20 + (i % 5) * 70,
    y: 20 + Math.floor(i / 5) * 120,
    w: 40,
    h: 60,
  }));
  const rgba = makeImage(w, h, blocks);
  const result = detectGreenSlots(rgba, w, h, 400, 300, 8);
  assert.equal(result.polygons.length, 8);
  assert.equal(result.skipped, 2);
});

test("detectGreenSlots: tanpa hijau → 0 poligon", () => {
  const rgba = makeImage(50, 50, []);
  const result = detectGreenSlots(rgba, 50, 50, 50, 50, 8);
  assert.equal(result.polygons.length, 0);
  assert.equal(result.skipped, 0);
});

test("simplifyPolygon: kurva rapat disederhanakan ke titik terkendali", () => {
  const circle: { x: number; y: number }[] = [];
  for (let i = 0; i < 720; i += 1) {
    const angle = (i / 720) * Math.PI * 2;
    circle.push({ x: 500 + Math.cos(angle) * 300, y: 500 + Math.sin(angle) * 300 });
  }
  const simplified = simplifyPolygon(circle, 1.5);
  assert.ok(simplified.length >= 3);
  assert.ok(simplified.length < 128, `titik ${simplified.length}`);
});

test("simplifyPolygon: garis lurus menyusut jadi 2 titik", () => {
  const line = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 20, y: 0 },
    { x: 30, y: 0 },
  ];
  assert.deepEqual(simplifyPolygon(line, 1), [
    { x: 0, y: 0 },
    { x: 30, y: 0 },
  ]);
});

test("detectGreenSlots: lingkaran hijau menghasilkan poligon tertutup (terminasi)", () => {
  const w = 200;
  const h = 200;
  const rgba = makeImage(w, h, []);
  const cx = 100;
  const cy = 100;
  const r = 60;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) {
        const p = (y * w + x) * 4;
        rgba[p] = GREEN[0];
        rgba[p + 1] = GREEN[1];
        rgba[p + 2] = GREEN[2];
        rgba[p + 3] = 255;
      }
    }
  }
  const result = detectGreenSlots(rgba, w, h, 200, 200, 8);
  assert.equal(result.polygons.length, 1);
  const points = result.polygons[0]!.points;
  assert.ok(points.length >= 3 && points.length < 128, `titik ${points.length}`);
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  assert.ok(Math.min(...xs) >= 35 && Math.max(...xs) <= 165);
  assert.ok(Math.min(...ys) >= 35 && Math.max(...ys) <= 165);
});
