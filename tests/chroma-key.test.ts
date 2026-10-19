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

test("applyChromaKey menerima warna kunci kustom", () => {
  const rgba = rgbaOf([[0, 0, 255]]);
  assert.equal(applyChromaKey(rgba, { key: [0, 0, 255], tolerance: 10 }), 1);
  assert.equal(rgba[3], 0);
});
