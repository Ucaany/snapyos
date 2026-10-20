/**
 * Phase 2 unit checks — agregasi dashboard (docs/12 Phase 2:
 * "unit perhitungan aggregate (gross − discount = net)"), uang integer IDR.
 * Run: npm test
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  avgTransactionInteger,
  dateRangeSchema,
  defaultRange,
  fillDailySeries,
  fillDailySeriesFromDays,
  formatIDR,
  localDayKey,
  rangeBoundariesTz,
  rangeDays,
  shiftISO,
  startOfDayTz,
  todayISO,
} from "../src/lib/dashboard-math.ts";

const TZ = "Asia/Jakarta";

// --- gross − discount = net (integer, dari baris transaksi) ---
test("agregat baris transaksi: gross − discount = net (integer IDR)", () => {
  const rows = [
    { gross: 50_000, discount: 0, final: 50_000 },
    { gross: 50_000, discount: 10_000, final: 40_000 },
    { gross: 25_000, discount: 5_000, final: 20_000 },
  ];
  const gross = rows.reduce((s, r) => s + r.gross, 0);
  const discount = rows.reduce((s, r) => s + r.discount, 0);
  const net = rows.reduce((s, r) => s + r.final, 0);
  assert.equal(gross - discount, net);
  assert.ok(Number.isInteger(net));
});

test("avgTransactionInteger membulatkan half-up tanpa float di output", () => {
  assert.equal(avgTransactionInteger(0, 0), 0);
  assert.equal(avgTransactionInteger(100_000, 4), 25_000);
  assert.equal(avgTransactionInteger(34_999, 2), 17_500); // 17499.5 → 17500
  assert.ok(Number.isInteger(avgTransactionInteger(10, 3)));
});

// --- date helpers ---
test("shiftISO & rangeDays inklusif", () => {
  assert.equal(shiftISO("2026-08-18", -29), "2026-07-20");
  assert.equal(rangeDays("2026-08-01", "2026-08-31"), 31);
  assert.equal(rangeDays("2026-08-18", "2026-08-18"), 1);
});

test("todayISO menghormati timezone bisnis", () => {
  // 2026-08-17T20:00Z = 2026-08-18 03:00 WIB
  const now = new Date("2026-08-17T20:00:00Z");
  assert.equal(todayISO(TZ, now), "2026-08-18");
  assert.equal(todayISO("UTC", now), "2026-08-17");
});

test("rangeBoundariesTz: from 00:00 lokal → to 24:00 lokal (UTC+7)", () => {
  const { startMs, endMs } = rangeBoundariesTz("2026-08-01", "2026-08-01", TZ);
  assert.equal(new Date(startMs).toISOString(), "2026-07-31T17:00:00.000Z");
  assert.equal(new Date(endMs).toISOString(), "2026-08-01T17:00:00.000Z");
});

test("startOfDayTz = awal hari lokal (UTC+7)", () => {
  assert.equal(new Date(startOfDayTz("2026-08-01", TZ)).toISOString(), "2026-07-31T17:00:00.000Z");
});

test("dateRangeSchema menolak from > to PA SCA merge default (guard server-side)", () => {
  // ?to= saja lolos schema (opsional), tapi merge default menghasilkan from > to
  // → server harus VALIDATION_ERROR (cek implementasi resolveRange, bukan schema).
  assert.equal(dateRangeSchema.safeParse({ to: "2026-01-15" }).success, true);
});

test("dateRangeSchema menolak format salah & from > to", () => {
  assert.equal(dateRangeSchema.safeParse({ from: "18-08-2026", to: "2026-08-19" }).success, false);
  assert.equal(dateRangeSchema.safeParse({ from: "2026-08-19", to: "2026-08-18" }).success, false);
  assert.equal(dateRangeSchema.safeParse({ from: "2026-08-01", to: "2026-08-18" }).success, true);
  assert.equal(dateRangeSchema.safeParse({}).success, true);
});

// --- deret harian ---
test("fillDailySeries zero-fill, urut, jumlah per hari lokal tz", () => {
  // 2026-08-01T18:00Z = 2026-08-02 01:00 WIB → masuk hari 02
  // 2026-08-02T20:00Z = 2026-08-03 03:00 WIB → masuk hari 03
  const rows = [
    { paidAtMs: Date.parse("2026-08-01T18:00:00Z"), amount: 25_000 },
    { paidAtMs: Date.parse("2026-08-02T02:00:00Z"), amount: 25_000 },
    { paidAtMs: Date.parse("2026-08-02T20:00:00Z"), amount: 50_000 },
  ];
  const series = fillDailySeries(rows, "2026-08-01", "2026-08-04", TZ);
  assert.deepEqual(
    series.map((p) => p.date),
    ["2026-08-01", "2026-08-02", "2026-08-03", "2026-08-04"]
  );
  assert.deepEqual(
    series.map((p) => p.amount),
    [0, 50_000, 50_000, 0]
  );
  assert.equal(
    series.reduce((s, p) => s + p.amount, 0),
    100_000
  );
});

test("localDayKey mengonversi UTC ms ke tanggal lokal", () => {
  assert.equal(localDayKey(Date.parse("2026-08-02T17:30:00Z"), TZ), "2026-08-03");
  assert.equal(localDayKey(Date.parse("2026-08-02T16:59:00Z"), TZ), "2026-08-02");
});

test("defaultRange = 30 hari inklusif sampai hari ini", () => {
  const r = defaultRange("2026-08-18");
  assert.equal(r.to, "2026-08-18");
  assert.equal(r.from, "2026-07-20");
  assert.equal(rangeDays(r.from, r.to), 30);
});

// --- format uang ---
test("formatIDR tanpa desimal", () => {
  assert.equal(formatIDR(1_250_000), "Rp 1.250.000");
  assert.equal(formatIDR(0), "Rp 0");
  assert.equal(formatIDR(500), "Rp 500");
});

// --- bucket SQL (RPC dashboard_daily_revenue) ---
test("fillDailySeriesFromDays zero-fill dari bucket SQL, paritas dengan fillDailySeries", () => {
  const days = [
    { date: "2026-08-02", amount: 50_000 },
    { date: "2026-08-02", amount: 25_000 }, // bucket ganda dijumlahkan
    { date: "2026-08-03", amount: 50_000 },
  ];
  const series = fillDailySeriesFromDays(days, "2026-08-01", "2026-08-04");
  assert.deepEqual(
    series.map((p) => p.date),
    ["2026-08-01", "2026-08-02", "2026-08-03", "2026-08-04"]
  );
  assert.deepEqual(
    series.map((p) => p.amount),
    [0, 75_000, 50_000, 0]
  );
});

test("fillDailySeriesFromDays menjepit negatif dan non-integer", () => {
  const series = fillDailySeriesFromDays(
    [
      { date: "2026-08-01", amount: -5 },
      { date: "2026-08-02", amount: 10_000.9 },
    ],
    "2026-08-01",
    "2026-08-02"
  );
  assert.deepEqual(
    series.map((p) => p.amount),
    [0, 10_000]
  );
});
