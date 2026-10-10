import assert from "node:assert/strict";
import { test } from "node:test";

import { buildTxInsights, buildTxInsightsFromGroups } from "../src/lib/tx-insights.ts";

const TZ = "Asia/Jakarta"; // UTC+7, tanpa DST

test("agregasi status: total, berhasil, gagal, pending", () => {
  const rows = [
    { status: "paid", final_amount: 50_000, paid_at: "2026-08-27T03:00:00Z", created_at: "2026-08-27T03:00:00Z", outlet_id: "o1", outlet_name: "Malioboro" },
    { status: "paid", final_amount: 25_000, paid_at: "2026-08-27T05:30:00Z", created_at: "2026-08-27T05:30:00Z", outlet_id: "o1", outlet_name: "Malioboro" },
    { status: "failed", final_amount: 50_000, paid_at: null, created_at: "2026-08-27T06:00:00Z", outlet_id: "o2", outlet_name: "Sleman" },
    { status: "pending", final_amount: 10_000, paid_at: null, created_at: "2026-08-27T07:00:00Z", outlet_id: "o2", outlet_name: "Sleman" },
  ];
  const r = buildTxInsights(rows, TZ);
  assert.equal(r.statusCounts.total, 4);
  assert.equal(r.statusCounts.paid, 2);
  assert.equal(r.statusCounts.failed, 1);
  assert.equal(r.statusCounts.pending, 1);
  assert.equal(r.statusCounts.cancelled, 0);
  assert.equal(r.statusCounts.refunded, 0);
  // Net hanya dari paid (integer).
  assert.equal(r.net, 75_000);
});

test("jam ramai: histogram jam lokal WIB + puncak benar", () => {
  const rows = [
    // 10:00 WIB
    { status: "paid", final_amount: 1, paid_at: "2026-08-27T03:00:00Z", created_at: "2026-08-27T03:00:00Z", outlet_id: "o1", outlet_name: "A" },
    // 12:30 WIB
    { status: "paid", final_amount: 1, paid_at: "2026-08-27T05:30:00Z", created_at: "2026-08-27T05:30:00Z", outlet_id: "o1", outlet_name: "A" },
    // 13:00 WIB — puncak (2 trx)
    { status: "failed", final_amount: 1, paid_at: null, created_at: "2026-08-27T06:00:00Z", outlet_id: "o2", outlet_name: "B" },
    { status: "paid", final_amount: 1, paid_at: "2026-08-27T06:10:00Z", created_at: "2026-08-27T06:10:00Z", outlet_id: "o2", outlet_name: "B" },
  ];
  const r = buildTxInsights(rows, TZ);
  assert.equal(r.hourly[10], 1);
  assert.equal(r.hourly[12], 1);
  assert.equal(r.hourly[13], 2);
  assert.equal(r.peakHour, 13);
  assert.equal(r.peakCount, 2);
  assert.equal(r.hourly.length, 24);
});

test("jam ramai: failed tanpa paid_at dihitung dari created_at", () => {
  const rows = [
    { status: "failed", final_amount: 1, paid_at: null, created_at: "2026-08-27T10:00:00Z", outlet_id: "o1", outlet_name: "A" }, // 17:00 WIB
  ];
  const r = buildTxInsights(rows, TZ);
  assert.equal(r.hourly[17], 1);
  assert.equal(r.peakHour, 17);
});

test("outlet teramai: ranking by count, gagal per outlet, net per outlet", () => {
  const rows = [
    { status: "paid", final_amount: 20_000, paid_at: "2026-08-27T03:00:00Z", created_at: "2026-08-27T03:00:00Z", outlet_id: "o1", outlet_name: "Malioboro" },
    { status: "paid", final_amount: 30_000, paid_at: "2026-08-27T04:00:00Z", created_at: "2026-08-27T04:00:00Z", outlet_id: "o1", outlet_name: "Malioboro" },
    { status: "failed", final_amount: 30_000, paid_at: null, created_at: "2026-08-27T05:00:00Z", outlet_id: "o1", outlet_name: "Malioboro" },
    { status: "paid", final_amount: 10_000, paid_at: "2026-08-27T06:00:00Z", created_at: "2026-08-27T06:00:00Z", outlet_id: "o2", outlet_name: "Sleman" },
  ];
  const r = buildTxInsights(rows, TZ);
  assert.equal(r.outlets.length, 2);
  assert.equal(r.outlets[0]!.name, "Malioboro"); // 3 trx > 1 trx
  assert.equal(r.outlets[0]!.count, 3);
  assert.equal(r.outlets[0]!.paidCount, 2);
  assert.equal(r.outlets[0]!.failedCount, 1);
  assert.equal(r.outlets[0]!.net, 50_000);
  assert.equal(r.outlets[1]!.name, "Sleman");
  assert.equal(r.outlets[1]!.net, 10_000);
  assert.equal(r.outlets[1]!.failedCount, 0);
});

test("outlet tanpa id di-map ke 'Tanpa outlet', bukan crash", () => {
  const rows = [
    { status: "paid", final_amount: 5_000, paid_at: "2026-08-27T03:00:00Z", created_at: "2026-08-27T03:00:00Z", outlet_id: null, outlet_name: null },
  ];
  const r = buildTxInsights(rows, TZ);
  assert.equal(r.outlets.length, 1);
  assert.equal(r.outlets[0]!.name, "Tanpa outlet");
  assert.equal(r.outlets[0]!.count, 1);
});

test("empty: total 0, peakHour null, hourly zero-filled", () => {
  const r = buildTxInsights([], TZ);
  assert.equal(r.statusCounts.total, 0);
  assert.equal(r.peakHour, null);
  assert.equal(r.peakCount, 0);
  assert.equal(r.hourly.every((c) => c === 0), true);
  assert.equal(r.outlets.length, 0);
  assert.equal(r.net, 0);
});

test("tie count antar outlet: urut by net lalu nama", () => {
  const rows = [
    { status: "paid", final_amount: 10_000, paid_at: "2026-08-27T03:00:00Z", created_at: "2026-08-27T03:00:00Z", outlet_id: "a", outlet_name: "Zeta" },
    { status: "paid", final_amount: 90_000, paid_at: "2026-08-27T04:00:00Z", created_at: "2026-08-27T04:00:00Z", outlet_id: "b", outlet_name: "Alfa" },
  ];
  const r = buildTxInsights(rows, TZ);
  assert.equal(r.outlets[0]!.name, "Alfa"); // net lebih besar
});

test("jumlah uang float di-trunc ke integer", () => {
  const rows = [
    { status: "paid", final_amount: 10_000.9, paid_at: "2026-08-27T03:00:00Z", created_at: "2026-08-27T03:00:00Z", outlet_id: "o1", outlet_name: "A" },
  ];
  const r = buildTxInsights(rows, TZ);
  assert.equal(r.net, 10_000);
});

test("status tak dikenal: tidak crash, total tetap dihitung", () => {
  const rows = [
    { status: "weird", final_amount: 1, paid_at: null, created_at: "2026-08-27T03:00:00Z", outlet_id: "o1", outlet_name: "A" },
  ];
  const r = buildTxInsights(rows, TZ);
  assert.equal(r.statusCounts.total, 1);
  assert.equal(r.statusCounts.paid, 0);
});

test("buildTxInsightsFromGroups paritas dengan buildTxInsights", () => {
  const rows = [
    { status: "paid", final_amount: 50_000, paid_at: "2026-08-27T03:00:00Z", created_at: "2026-08-27T03:00:00Z", outlet_id: "o1", outlet_name: "Malioboro" },
    { status: "paid", final_amount: 25_000, paid_at: "2026-08-27T05:30:00Z", created_at: "2026-08-27T05:30:00Z", outlet_id: "o1", outlet_name: "Malioboro" },
    { status: "failed", final_amount: 50_000, paid_at: null, created_at: "2026-08-27T06:00:00Z", outlet_id: "o2", outlet_name: "Sleman" },
    { status: "pending", final_amount: 10_000, paid_at: null, created_at: "2026-08-27T07:00:00Z", outlet_id: null, outlet_name: null },
  ];
  // Grup persis seperti dikembalikan RPC tx_insights_summary (jam WIB).
  const groups = [
    { status: "paid", hr: 10, outlet_id: "o1", outlet_name: "Malioboro", amount: 50_000, tx_count: 1 },
    { status: "paid", hr: 12, outlet_id: "o1", outlet_name: "Malioboro", amount: 25_000, tx_count: 1 },
    { status: "failed", hr: 13, outlet_id: "o2", outlet_name: "Sleman", amount: 0, tx_count: 1 },
    { status: "pending", hr: 14, outlet_id: null, outlet_name: "Tanpa outlet", amount: 0, tx_count: 1 },
  ];
  const expected = buildTxInsights(rows, TZ);
  const actual = buildTxInsightsFromGroups(groups);
  assert.deepEqual(actual, expected);
});

test("buildTxInsightsFromGroups empty: total 0, peakHour null", () => {
  const r = buildTxInsightsFromGroups([]);
  assert.equal(r.statusCounts.total, 0);
  assert.equal(r.peakHour, null);
  assert.equal(r.net, 0);
});
