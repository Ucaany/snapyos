import assert from "node:assert/strict";
import { test } from "node:test";

import { formatDate } from "../src/lib/dashboard-math.ts";
import { dateFieldsSchema, dateRangeSchema } from "../src/lib/dashboard-math.ts";

// Transaksi 2026-01-01 00:30 WIB === 2025-12-31 17:30 UTC.
const nightWib = "2025-12-31T17:30:00.000Z";

test("formatDate: order malam WIB menghasilkan hari yang benar (1 Jan, bukan 31 Des)", () => {
  const out = formatDate(nightWib, "Asia/Jakarta");
  assert.match(out, /1 Jan 2026/);
  assert.doesNotMatch(out, /Des 2025/);
});

test("formatDate: bug lama — timeZone UTC menggeser hari ke 31 Des 2025", () => {
  assert.match(formatDate(nightWib, "UTC"), /31 Des 2025/);
});

test("formatDate: fallback tz kosong → Asia/Jakarta", () => {
  assert.equal(formatDate(nightWib, ""), formatDate(nightWib, "Asia/Jakarta"));
});

test("formatDate: terima Date / number / string dengan hasil sama", () => {
  const ms = Date.parse(nightWib);
  const a = formatDate(new Date(ms), "Asia/Jakarta");
  const b = formatDate(ms, "Asia/Jakarta");
  const c = formatDate(nightWib, "Asia/Jakarta");
  assert.equal(a, b);
  assert.equal(b, c);
});

// Regresi O1: URL rentang terbalik (?from>to / ?from= masa depan) tidak boleh
// melempar error boundary. dateFieldsSchema = jalur render (tanpa cek urutan),
// dateRangeSchema = jalur API ketat (tetap menolak).
test("dateFieldsSchema: menerima rentang terbalik (jalur render menormalkan)", () => {
  const parsed = dateFieldsSchema.parse({ from: "2026-10-10", to: "2026-10-01" });
  assert.deepEqual(parsed, { from: "2026-10-10", to: "2026-10-01" });
});

test("dateFieldsSchema: menolak format tanggal salah", () => {
  assert.equal(dateFieldsSchema.safeParse({ from: "10-10-2026" }).success, false);
  assert.equal(dateFieldsSchema.safeParse({ from: "bukan-tanggal" }).success, false);
});

test("dateRangeSchema: tetap ketat menolak from > to (kontrak API)", () => {
  assert.equal(dateRangeSchema.safeParse({ from: "2026-10-10", to: "2026-10-01" }).success, false);
  assert.equal(dateRangeSchema.safeParse({ from: "2026-10-01", to: "2026-10-10" }).success, true);
});
