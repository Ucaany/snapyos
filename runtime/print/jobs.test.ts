import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyPrintError, defaultDedupeKey, sheetHash } from "./jobs.ts";

test("sheetHash stabil untuk isi sama dan berubah saat isi berbeda", () => {
  const a = sheetHash([["foto-a", "foto-b"]]);
  const b = sheetHash([["foto-a", "foto-b"]]);
  const c = sheetHash([["foto-a", "foto-c"]]);
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.equal(a.length, 32);
});

test("defaultDedupeKey memakai session dan hash", () => {
  const key = defaultDedupeKey("sesi-1", [["x"]]);
  assert.match(key, /^sesi-1:[0-9a-f]{32}$/);
  assert.match(defaultDedupeKey(null, []), /^no-session:[0-9a-f]{32}$/);
});

test("classifyPrintError memisahkan transien dan permanen", () => {
  assert.equal(classifyPrintError("Printer DNP sedang disabled di CUPS."), "transient");
  assert.equal(classifyPrintError("Printer offline. Periksa kabel."), "transient");
  assert.equal(classifyPrintError("lp timeout. Periksa perangkat."), "transient");
  assert.equal(classifyPrintError("Berkas PDF job hilang."), "permanent");
  assert.equal(classifyPrintError("Printer tujuan tidak diketahui."), "permanent");
  assert.equal(classifyPrintError("sesuatu yang aneh"), "unknown");
});
