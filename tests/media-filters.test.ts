/**
 * Filter server-side — sumber: src/server/media/filters.ts.
 *
 * Dua hal yang dijaga di sini:
 * 1. ID filter server HARUS sama dengan `FILTER_PRESETS` klien (anti-drift).
 * 2. Pemetaan CSS → sharp benar secara aritmetika (kontras titik-netral 128).
 */

import assert from "node:assert/strict";
import { register } from "node:module";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { FILTER_PRESETS } from "../src/lib/kiosk-types.ts";

register(
  pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), "helpers", "resolve-loader.mjs"))
    .href,
  import.meta.url
);

const mod = await import("../src/server/media/filters.ts");

test("ID filter server identik dengan FILTER_PRESETS klien", () => {
  assert.deepEqual(
    [...mod.FILTER_IDS],
    FILTER_PRESETS.map((preset) => preset.id),
    "daftar filter klien dan server tidak boleh berbeda"
  );
});

test("normalizeFilterId: nilai tak dikenal jatuh ke original, bukan error", () => {
  assert.equal(mod.normalizeFilterId("film"), "film");
  assert.equal(mod.normalizeFilterId("nope"), "original");
  assert.equal(mod.normalizeFilterId(null), "original");
  assert.equal(mod.normalizeFilterId(42), "original");
});

test("sepiaBlend: 0 = identitas, 1 = sepia penuh", () => {
  assert.deepEqual(mod.sepiaBlend(0), [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ]);
  const full = mod.sepiaBlend(1);
  assert.equal(full[0]![0], 0.393);
  assert.equal(full[0]![1], 0.769);
  assert.equal(full[2]![2], 0.131);
});

test("sepiaBlend: clamp di luar 0..1 dan deterministik", () => {
  assert.deepEqual(mod.sepiaBlend(-5), mod.sepiaBlend(0));
  assert.deepEqual(mod.sepiaBlend(9), mod.sepiaBlend(1));
  const a = mod.sepiaBlend(0.25);
  assert.deepEqual(a, mod.sepiaBlend(0.25));
});

test("filterPlan: original = tanpa operasi", () => {
  assert.deepEqual(mod.filterPlan("original"), {});
});

test("filterPlan: kontras CSS → linear b = 128 × (1 − c)", () => {
  assert.deepEqual(mod.filterPlan("film").linear, { a: 1.05, b: 128 * (1 - 1.05) });
  assert.deepEqual(mod.filterPlan("bw").linear, { a: 1.1, b: 128 * (1 - 1.1) });
  assert.deepEqual(mod.filterPlan("vintage").linear, { a: 0.95, b: 128 * (1 - 0.95) });
});

test("filterPlan: setiap preset punya rencana (kecuali original)", () => {
  for (const id of mod.FILTER_IDS) {
    const plan = mod.filterPlan(id);
    if (id === "original") continue;
    assert.ok(
      Object.keys(plan).length > 0,
      `preset ${id} tidak punya operasi apa pun — filter akan tampak tidak bekerja`
    );
  }
});

test("applyFilter: menghasilkan JPEG valid dan mengubah piksel untuk filter non-original", async () => {
  const { default: sharp } = await import("sharp");
  const source = await sharp({
    create: { width: 24, height: 24, channels: 3, background: { r: 120, g: 90, b: 200 } },
  })
    .jpeg({ quality: 100 })
    .toBuffer();

  const original = await mod.applyFilter(source, "original");
  assert.equal(original[0], 0xff);
  assert.equal(original[1], 0xd8);

  const bw = await mod.applyFilter(source, "bw");
  const { data } = await sharp(bw).raw().toBuffer({ resolveWithObject: true });
  // Grayscale wajib: ketiga kanal piksel sama.
  assert.equal(data[0], data[1]);
  assert.equal(data[1], data[2]);
});
