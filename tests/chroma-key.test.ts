/**
 * Chroma key — penghapusan latar hijau (pure, tanpa DOM).
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyChromaKey,
  colorDistance,
  sampleCornerColor,
  DEFAULT_CHROMA_KEY,
  isGreenBackground,
} from "../src/lib/chroma-key.ts";

function rgbaOf(pixels: [number, number, number][]): Uint8ClampedArray {
  const out = new Uint8ClampedArray(pixels.length * 4);
  pixels.forEach(([r, g, b], i) => {
    out[i * 4] = r;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = b;
    out[i * 4 + 3] = 255;
  });
  return out;
}

test("colorDistance menghitung jarak Euclidean", () => {
  assert.equal(colorDistance([0, 0, 0], [0, 0, 0]), 0);
  assert.equal(colorDistance([0, 0, 0], [3, 4, 0]), 5);
});

test("sampleCornerColor merata-ratakan empat sudut", () => {
  // 2x2: dua piksel hijau, dua piksel biru.
  const rgba = rgbaOf([
    [0, 255, 0],
    [0, 255, 0],
    [0, 0, 255],
    [0, 0, 255],
  ]);
  assert.deepEqual(sampleCornerColor(rgba, 2, 2), [0, 128, 128]);
});

test("applyChromaKey menghapus warna kunci penuh", () => {
  const rgba = rgbaOf([
    [0, 177, 64],
    [200, 120, 80],
  ]);
  const changed = applyChromaKey(rgba);
  assert.equal(changed, 1);
  assert.equal(rgba[3], 0, "piksel hijau jadi transparan");
  assert.equal(rgba[7], 255, "piksel lain tetap utuh");
});

test("applyChromaKey: warna dekat kunci (bayangan) ikut dihapus bertahap", () => {
  const rgba = rgbaOf([
    [10, 165, 70], // dekat
    [120, 177, 64], // jauh
  ]);
  applyChromaKey(rgba, { ...DEFAULT_CHROMA_KEY, tolerance: 100, softness: 0.5 });
  assert.ok(rgba[3]! < 255, "piksel dekat kunci punya alpha lebih rendah");
  assert.equal(rgba[7], 255, "piksel jauh tidak disentuh");
});

test("applyChromaKey: foto tanpa warna kunci tidak berubah", () => {
  const rgba = rgbaOf([
    [200, 120, 80],
    [30, 30, 30],
  ]);
  assert.equal(applyChromaKey(rgba), 0);
  assert.equal(rgba[3], 255);
  assert.equal(rgba[7], 255);
});

test("applyChromaKey menerima warna kunci hijau kustom", () => {
  const rgba = rgbaOf([[0, 255, 0]]);
  assert.equal(applyChromaKey(rgba, { key: [0, 255, 0], tolerance: 10 }), 1);
  assert.equal(rgba[3], 0);
});

test("isGreenBackground: dominasi hijau dan nuansa hijau diterima", () => {
  assert.equal(isGreenBackground([0, 177, 64]), true);
  assert.equal(isGreenBackground([80, 200, 120]), true);
});

test("isGreenBackground: biru, abu, dan merah ditolak", () => {
  assert.equal(isGreenBackground([0, 0, 255]), false);
  assert.equal(isGreenBackground([128, 128, 128]), false);
  assert.equal(isGreenBackground([220, 40, 40]), false);
});

test("gate + size: latar non-hijau tidak mengubah buffer", () => {
  const rgba = rgbaOf([
    [40, 80, 200],
    [40, 80, 200],
    [40, 80, 200],
    [40, 80, 200],
  ]);
  const before = Uint8ClampedArray.from(rgba);
  const changed = applyChromaKey(rgba, DEFAULT_CHROMA_KEY, { width: 2, height: 2 });
  assert.equal(changed, 0);
  assert.deepEqual(Array.from(rgba), Array.from(before));
});

test("gate tanpa size: key non-hijau tidak mengubah buffer", () => {
  const rgba = rgbaOf([
    [0, 0, 255],
    [0, 0, 255],
  ]);
  const before = Uint8ClampedArray.from(rgba);
  const changed = applyChromaKey(rgba, { key: [0, 0, 255], tolerance: 10 });
  assert.equal(changed, 0);
  assert.deepEqual(Array.from(rgba), Array.from(before));
});

test("green screen + size: piksel hijau jadi transparan", () => {
  const rgba = rgbaOf([
    [0, 177, 64],
    [0, 177, 64],
    [0, 177, 64],
    [0, 177, 64],
  ]);
  const changed = applyChromaKey(rgba, DEFAULT_CHROMA_KEY, { width: 2, height: 2 });
  assert.ok(changed > 0, "ada piksel yang diubah");
  for (let p = 0; p < rgba.length; p += 4) {
    assert.equal(rgba[p + 3], 0, "semua piksel hijau transparan");
  }
});

test("spill: piksel pita lembut di-clamp ke max(red, blue)", () => {
  const rgba = rgbaOf([[80, 200, 60]]);
  const changed = applyChromaKey(rgba, DEFAULT_CHROMA_KEY);
  assert.equal(changed, 1);
  const alpha = rgba[3]!;
  assert.ok(alpha > 0 && alpha < 255, "alpha parsial di pita lembut");
  assert.ok(
    rgba[1]! <= Math.max(rgba[0]!, rgba[2]!),
    "green tidak melebihi max(red, blue)"
  );
});

test("soft edge: alpha proporsional, bukan biner", () => {
  const rgba = rgbaOf([[75, 200, 64]]);
  applyChromaKey(rgba, DEFAULT_CHROMA_KEY);
  const alpha = rgba[3]!;
  assert.ok(alpha > 0 && alpha < 255, "alpha di antara 0 dan 255");
  assert.ok(alpha !== 0 && alpha !== 255);
});

test("gate + size: foto penuh non-hijau dengan key hijau → 0", () => {
  const rgba = rgbaOf([
    [200, 120, 80],
    [200, 120, 80],
    [200, 120, 80],
    [200, 120, 80],
  ]);
  const before = Uint8ClampedArray.from(rgba);
  const changed = applyChromaKey(rgba, DEFAULT_CHROMA_KEY, { width: 2, height: 2 });
  assert.equal(changed, 0);
  assert.deepEqual(Array.from(rgba), Array.from(before));
});
