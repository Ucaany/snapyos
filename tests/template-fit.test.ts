/**
 * Pengisian slot frame oleh foto — aturan lintas paket (2026-10-19).
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { fillSlots, framePerPhoto, resolveCaptureCount } from "../src/lib/template-fit.ts";

test("resolveCaptureCount: slot frame mengalahkan jumlah foto package", () => {
  assert.equal(resolveCaptureCount(3, 6), 6);
  assert.equal(resolveCaptureCount(6, 0), 6);
  assert.equal(resolveCaptureCount(Number.NaN, Number.NaN), 1);
});

test("slot sama dengan foto: satu-satu, tanpa pengulangan", () => {
  assert.deepEqual(fillSlots(3, 3), [0, 1, 2]);
});

test("slot lebih banyak dari foto: foto diulang bergiliran", () => {
  assert.deepEqual(fillSlots(6, 3), [0, 1, 2, 0, 1, 2]);
  assert.deepEqual(fillSlots(7, 3), [0, 1, 2, 0, 1, 2, 0]);
});

test("slot lebih sedikit dari foto: foto pertama dipakai", () => {
  assert.deepEqual(fillSlots(2, 5), [0, 1]);
});

test("matriks 1..8 slot x 1..8 foto: panjang benar dan indeks selalu valid", () => {
  for (let slots = 1; slots <= 8; slots++) {
    for (let photos = 1; photos <= 8; photos++) {
      const result = fillSlots(slots, photos);
      assert.equal(result.length, slots, `slot=${slots} foto=${photos}`);
      for (const index of result) {
        assert.ok(index >= 0 && index < photos, `indeks ${index} di luar 0..${photos - 1}`);
      }
      assert.equal(result[0], 0);
    }
  }
});

test("input tidak valid menghasilkan daftar kosong", () => {
  assert.deepEqual(fillSlots(0, 3), []);
  assert.deepEqual(fillSlots(3, 0), []);
  assert.deepEqual(fillSlots(-2, 3), []);
  assert.deepEqual(fillSlots(3, -1), []);
  assert.deepEqual(fillSlots(3.9, 2.2), [0, 1, 0]);
});

test("framePerPhoto: tepat satu slot terisi per foto, sisanya kosong", () => {
  assert.deepEqual(framePerPhoto(4, 0), [0, null, null, null]);
  assert.deepEqual(framePerPhoto(4, 2), [null, null, 2, null]);
  assert.deepEqual(framePerPhoto(4, 3), [null, null, null, 3]);
});

test("framePerPhoto: indeks di luar frame tidak mengisi slot apa pun", () => {
  for (const index of [-1, 4, 99, Number.NaN]) {
    const slots = framePerPhoto(4, index);
    assert.equal(slots.length, 4);
    assert.ok(
      slots.every((s) => s === null),
      `indeks ${index} tidak boleh mengisi slot`
    );
  }
  assert.deepEqual(framePerPhoto(0, 0), []);
});

test("framePerPhoto x jumlah foto: setiap foto menyumbang satu frame ber-slot", () => {
  const slotCount = 6;
  const frames = Array.from({ length: slotCount }, (_, i) => framePerPhoto(slotCount, i));
  assert.equal(frames.length, slotCount);
  frames.forEach((frame, i) => {
    assert.equal(frame.filter((s) => s !== null).length, 1, `frame ${i} wajib satu slot terisi`);
    assert.equal(frame[i], i);
  });
});
