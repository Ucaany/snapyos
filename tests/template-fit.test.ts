/**
 * Pengisian slot frame oleh foto — aturan lintas paket (2026-10-19).
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { fillSlots, hasRepeatedSlots } from "../src/lib/template-fit.ts";

test("slot sama dengan foto: satu-satu, tanpa pengulangan", () => {
  assert.deepEqual(fillSlots(3, 3), [0, 1, 2]);
  assert.equal(hasRepeatedSlots(3, 3), false);
});

test("slot lebih banyak dari foto: foto diulang bergiliran", () => {
  assert.deepEqual(fillSlots(6, 3), [0, 1, 2, 0, 1, 2]);
  assert.deepEqual(fillSlots(7, 3), [0, 1, 2, 0, 1, 2, 0]);
  assert.equal(hasRepeatedSlots(6, 3), true);
});

test("slot lebih sedikit dari foto: foto pertama dipakai", () => {
  assert.deepEqual(fillSlots(2, 5), [0, 1]);
  assert.equal(hasRepeatedSlots(2, 5), false);
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
