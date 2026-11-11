/**
 * Auto-pilih template kiosk + assign otomatis paket — MURNI.
 * Run: npm test
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { autoAssignTemplateIds, selectAutoTemplate } from "../src/lib/template-select.ts";
import { selectVisibleTemplates } from "../src/lib/template-visibility.ts";

const t = (id: string, package_ids: string[] = []) => ({ id, package_ids });

test("selectAutoTemplate: default booth menang bila masih eligible", () => {
  const templates = [t("a"), t("b"), t("c")];
  assert.equal(selectAutoTemplate(templates, "b")?.id, "b");
});

test("selectAutoTemplate: default tidak eligible -> tidak auto-pilih", () => {
  const templates = [t("a"), t("b")];
  assert.equal(selectAutoTemplate(templates, "hilang"), null);
});

test("selectAutoTemplate: hanya 1 template eligible -> auto-pilih", () => {
  assert.equal(selectAutoTemplate([t("solo")], null)?.id, "solo");
});

test("selectAutoTemplate: kosong -> null", () => {
  assert.equal(selectAutoTemplate([], "a"), null);
});

test("auto-pilih setelah filter paket: default yang difilter keluar tidak dipilih", () => {
  // Regresi: id default dari DB bisa saja tidak eligible untuk paket ini.
  const templates = [t("a", ["p1"]), t("b", ["p1"]), t("c", ["p2"])];
  const eligible = selectVisibleTemplates(templates, { packageId: "p1" });
  assert.deepEqual(
    eligible.map((x) => x.id),
    ["a", "b"]
  );
  assert.equal(selectAutoTemplate(eligible, "c"), null);
  assert.equal(selectAutoTemplate(eligible, "b")?.id, "b");
});

test("auto-pilih: satu template tersisa setelah filter paket tetap dipilih", () => {
  const eligible = selectVisibleTemplates([t("a", ["p1"]), t("c", ["p2"])], { packageId: "p1" });
  assert.equal(selectAutoTemplate(eligible, "c")?.id, "a");
});

test("autoAssignTemplateIds: utamakan slot_count == photo_count", () => {
  const ids = autoAssignTemplateIds(
    [
      { id: "dua", slotCount: 2 },
      { id: "tiga", slotCount: 3 },
    ],
    { photoCount: 3, captureMode: "single" }
  );
  assert.deepEqual(ids, ["tiga"]);
});

test("autoAssignTemplateIds: fallback ke kecocokan mode", () => {
  // Tidak ada slot 4; photostrip butuh >= max(2, photoCount).
  const ids = autoAssignTemplateIds(
    [
      { id: "satu", slotCount: 1 },
      { id: "enam", slotCount: 6 },
    ],
    { photoCount: 4, captureMode: "photostrip" }
  );
  assert.deepEqual(ids, ["enam"]);
});

test("autoAssignTemplateIds: single cocok dengan template 1 slot", () => {
  const ids = autoAssignTemplateIds(
    [
      { id: "satu", slotCount: 1 },
      { id: "empat", slotCount: 4 },
    ],
    { photoCount: 3, captureMode: "single" }
  );
  assert.deepEqual(ids, ["satu"]);
});

test("autoAssignTemplateIds: fallback terdekat, tidak pernah kosong", () => {
  const ids = autoAssignTemplateIds(
    [
      { id: "dua", slotCount: 2 },
      { id: "delapan", slotCount: 8 },
    ],
    { photoCount: 5, captureMode: "burst" }
  );
  assert.deepEqual(ids.sort(), ["delapan", "dua"].sort());
});

test("autoAssignTemplateIds: tanpa kandidat -> []", () => {
  assert.deepEqual(autoAssignTemplateIds([], { photoCount: 3, captureMode: "single" }), []);
});
