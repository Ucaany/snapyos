/**
 * Visibilitas template kiosk — docs/05 §5.4 (aturan lintas paket 2026-10-19).
 * Run: npm test
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { slotCount } from "../src/lib/template-layout.ts";
import { selectVisibleTemplates } from "../src/lib/template-visibility.ts";

function layoutWithSlots(n: number) {
  return {
    version: 1,
    canvas: { width: 1200, height: 1800, preset: "4x6-portrait" },
    slots: Array.from({ length: n }, (_, i) => ({
      id: `s${i}`,
      shape: "rect" as const,
      x: 0,
      y: i * 100,
      width: 100,
      height: 100,
      rotation: 0,
      z: i,
    })),
  };
}

const t = (id: string, slots: number) => ({ id, layout: layoutWithSlots(slots) });

test("slotCount tetap membaca layout legacy", () => {
  assert.equal(slotCount(layoutWithSlots(0)), 0);
  assert.equal(slotCount(layoutWithSlots(3)), 3);
});

test("tanpa package: semua kandidat tampil", () => {
  const rows = [t("a", 3), t("b", 4)];
  assert.deepEqual(
    selectVisibleTemplates(rows, { assignedIds: null }).map((r) => r.id),
    ["a", "b"]
  );
});

test("assignment package menyempitkan daftar tanpa memandang jumlah slot", () => {
  // Regresi: dulu frame 4 slot disembunyikan dari paket 3 foto.
  const rows = [t("a", 4), t("b", 1), t("c", 2)];
  assert.deepEqual(
    selectVisibleTemplates(rows, { assignedIds: new Set(["a", "b"]), photoCount: 3 }).map((r) => r.id),
    ["a", "b"]
  );
});

test("frame 6 slot tampil untuk paket 3 foto", () => {
  const rows = [t("enam", 6)];
  assert.deepEqual(
    selectVisibleTemplates(rows, {
      assignedIds: null,
      photoCount: 3,
      slotCountOf: slotCount,
    }).map((r) => r.id),
    ["enam"]
  );
});

test("paket tanpa assignment sama sekali: semua frame aktif tampil", () => {
  const rows = [t("a", 2), t("b", 3)];
  assert.deepEqual(
    selectVisibleTemplates(rows, { assignedIds: new Set() }).map((r) => r.id),
    ["a", "b"]
  );
});

test("assignment menunjuk template yang sudah tidak aktif: jatuh ke semua kandidat", () => {
  const rows = [t("a", 2), t("b", 3)];
  assert.deepEqual(
    selectVisibleTemplates(rows, { assignedIds: new Set(["hilang"]) }).map((r) => r.id),
    ["a", "b"]
  );
});
