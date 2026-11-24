import test from "node:test";
import assert from "node:assert/strict";

import {
  escapeHtml,
  formatRevenueDigest,
  formatRevenueMessage,
  formatRupiah,
  formatWibDate,
} from "./revenue-message.ts";

void test("rupiah diformat gaya Indonesia", () => {
  assert.equal(formatRupiah(149000), "Rp149.000");
  assert.equal(formatRupiah(0), "Rp0");
  assert.equal(formatRupiah(1250000.4), "Rp1.250.000");
});

void test("html di-escape agar parse_mode Telegram tidak pecah", () => {
  assert.equal(escapeHtml("<b>x</b> & y"), "&lt;b&gt;x&lt;/b&gt; &amp; y");
});

void test("tanggal WIB memakai zona Asia/Jakarta", () => {
  // 2026-11-21T12:30:00Z = 19:30 WIB
  assert.equal(formatWibDate("2026-11-21T12:30:00Z"), "21 Nov 2026");
});

void test("pesan revenue memuat nominal, invoice, dan riwayat", () => {
  const text = formatRevenueMessage({
    kind: "renewal",
    amount: 149000,
    businessName: "Klik Foto Studio",
    ownerName: "Budi",
    ownerEmail: "budi@mail.id",
    planName: "Pro",
    invoiceNumber: "INV-0067",
    provider: "pakasir",
    occurredAt: "2026-11-21T12:30:00Z",
    periodEnd: "2026-12-21T12:30:00Z",
    items: [{ label: "Pro", qty: 1, amount: 149000 }],
    history: {
      paidCount: 4,
      lifetimeAmount: 596000,
      joinedAt: "2026-09-01T02:00:00Z",
      trialEndsAt: "2026-09-15T02:00:00Z",
      recent: [{ at: "2026-10-21T12:30:00Z", label: "Pro", amount: 149000 }],
      todayAmount: 149000,
      monthAmount: 447000,
    },
  });
  assert.match(text, /Perpanjangan langganan/);
  assert.match(text, /Rp149\.000/);
  assert.match(text, /Klik Foto Studio/);
  assert.match(text, /budi@mail\.id/);
  assert.match(text, /INV-0067/);
  assert.match(text, /Riwayat bisnis ini/);
  assert.match(text, /Total transaksi: <b>Rp596\.000<\/b> \(4×\)/);
  assert.match(text, /Revenue hari ini: Rp149\.000 · bulan ini: Rp447\.000/);
});

void test("pesan trial tidak menampilkan nominal uang", () => {
  const text = formatRevenueMessage({
    kind: "trial",
    amount: 0,
    businessName: "Bisnis Baru",
    trialDays: 14,
    periodEnd: "2026-12-05T02:00:00Z",
    history: {
      paidCount: 0,
      lifetimeAmount: 0,
      recent: [],
      joinedAt: "2026-11-21T02:00:00Z",
      trialEndsAt: "2026-12-05T02:00:00Z",
    },
  });
  assert.match(text, /Trial dimulai/);
  assert.match(text, /Trial sampai: 5 Des 2026 · 14 hari/);
  assert.match(text, /Belum ada transaksi berbayar/);
  assert.doesNotMatch(text, /Nominal:/);
});

void test("nama bisnis berisi karakter html tidak merusak pesan", () => {
  const text = formatRevenueMessage({
    kind: "new_subscription",
    amount: 99000,
    businessName: "<script>&",
  });
  assert.match(text, /&lt;script&gt;&amp;/);
  assert.doesNotMatch(text, /<script>/);
});

void test("pesan checkout menandai status menunggu pembayaran", () => {
  const text = formatRevenueMessage({
    kind: "checkout",
    amount: 149000,
    businessName: "Klik Foto Studio",
    items: [{ label: "Pro (30 hari)", qty: 1, amount: 149000 }],
    invoiceNumber: "INV-0068",
  });
  assert.match(text, /Transaksi langganan dibuat/);
  assert.match(text, /Status: menunggu pembayaran/);
  assert.match(text, /Rp149\.000/);
});

void test("rekap harian memuat total dan rincian", () => {
  const text = formatRevenueDigest({
    periodLabel: "21 Nov 2026",
    revenueToday: 298000,
    transactionsToday: 2,
    revenueMonth: 1046000,
    transactionsMonth: 7,
    newTrialsToday: 1,
    activeTrials: 3,
    byKind: [{ label: "Pro", count: 2, amount: 298000 }],
    topBusinesses: [{ name: "Klik Foto Studio", amount: 298000 }],
  });
  assert.match(text, /Rekap Revenue SnapyOS — 21 Nov 2026/);
  assert.match(text, /Hari ini: <b>Rp298\.000<\/b> \(2 transaksi\)/);
  assert.match(text, /Bulan ini: Rp1\.046\.000 \(7 transaksi\)/);
  assert.match(text, /Pembayar teratas hari ini/);
});
