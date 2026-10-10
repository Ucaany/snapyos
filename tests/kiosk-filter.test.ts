import test from "node:test";
import assert from "node:assert/strict";
import { FILTER_PRESETS, type EditorAdjust, type PhotoEdit } from "../src/lib/kiosk-types.ts";

test("FILTER_PRESETS: id unik + css non-kosong + Original = none", () => {
  const ids = FILTER_PRESETS.map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length, "filter id harus unik");
  for (const f of FILTER_PRESETS) {
    assert.equal(typeof f.label, "string");
    assert.equal(typeof f.css, "string");
  }
  assert.equal(FILTER_PRESETS.find((f) => f.id === "original")?.css, "none");
});

test("FILTER_PRESETS: id canonical tetap (dipakai render + persist)", () => {
  const ids = FILTER_PRESETS.map((f) => f.id);
  assert.deepEqual(ids, [
    "original",
    "film",
    "warm",
    "cool",
    "bw",
    "retro",
    "vintage",
    "y2k",
  ]);
});

test("defaultEdit: filter default original + tanpa adjust slider lama", () => {
  const edit = defaultEditShape();
  assert.equal(edit.adjust.filter, "original");
  assert.equal(edit.adjust.zoom, 1);
  assert.equal(edit.adjust.rotation, 0);
  // Field adjust per-foto (brightness/contrast/saturation/blur/grain/vignette)
  // dihapus — filter sekarang global, bukan adjust satu per satu.
  const adjustKeys = Object.keys(edit.adjust).sort();
  assert.deepEqual(adjustKeys, ["filter", "panX", "panY", "rotation", "zoom"]);
  assert.deepEqual(edit.overlays, []);
});

/** Cermin defaultEdit() di photo-render.ts (tanpa impor runtime @/ agar testable). */
function defaultEditShape(): PhotoEdit {
  return {
    adjust: { filter: "original", zoom: 1, panX: 0, panY: 0, rotation: 0 },
    overlays: [],
  };
}

test("EditorAdjust: tidak ada lagi field adjust satu per satu", () => {
  // Compile-time guard tambahan: pastikan tipe tidak menyertakan key lama.
  const valid: EditorAdjust = {
    filter: "bw",
    zoom: 1,
    panX: 0,
    panY: 0,
    rotation: 0,
  };
  assert.equal(valid.filter, "bw");
  assert.ok(!("brightness" in valid));
  assert.ok(!("contrast" in valid));
  assert.ok(!("saturation" in valid));
  assert.ok(!("blur" in valid));
  assert.ok(!("grain" in valid));
  assert.ok(!("vignette" in valid));
});

test("PhotoEdit: overlay & adjust terpisah (filter global via filteredEdit)", () => {
  const base: PhotoEdit = defaultEditShape();
  const withFilter: PhotoEdit = { ...base, adjust: { ...base.adjust, filter: "retro" } };
  assert.equal(withFilter.adjust.filter, "retro");
  assert.equal(base.adjust.filter, "original", "base tidak termutasi");
});
