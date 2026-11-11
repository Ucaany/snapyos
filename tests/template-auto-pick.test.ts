/**
 * Auto-pilih template kiosk — MURNI.
 * Run: npm test
 *
 * Filter assignment paket dihapus 2026-11-11: semua template aktif tampil untuk
 * semua paket, jadi auto-pilih hanya memutuskan default booth vs pilihan tunggal.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { selectAutoTemplate } from "../src/lib/template-select.ts";

const t = (id: string) => ({ id });

test("selectAutoTemplate: default booth menang bila masih ada", () => {
  assert.equal(selectAutoTemplate([t("a"), t("b"), t("c")], "b")?.id, "b");
});

test("selectAutoTemplate: default tidak ada di daftar -> tidak auto-pilih", () => {
  assert.equal(selectAutoTemplate([t("a"), t("b")], "hilang"), null);
});

test("selectAutoTemplate: hanya 1 template -> auto-pilih", () => {
  assert.equal(selectAutoTemplate([t("solo")], null)?.id, "solo");
});

test("selectAutoTemplate: kosong -> null", () => {
  assert.equal(selectAutoTemplate([], "a"), null);
});

test("selectAutoTemplate: banyak template tanpa default -> customer memilih", () => {
  assert.equal(selectAutoTemplate([t("a"), t("b")], null), null);
});
