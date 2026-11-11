/**
 * Dashboard owner kompleks — metrik operasional untuk semua role,
 * kesehatan booth, alert, delta revenue, dan kerapian UI.
 *
 * Fokus unit test di sini adalah logika murni (ambang alert/health) plus
 * kontrak file yang mudah di-regress: halaman tidak boleh membuang blok
 * operasional untuk role non-finansial, dan komponen baru wajib Brutalist.
 *
 * Run: npm test
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  BOOTH_STALE_MINUTES,
  STORAGE_ALERT_PERCENT,
  SUBSCRIPTION_ALERT_DAYS,
  buildBoothHealth,
  daysUntil,
  minutesSince,
} from "../src/lib/booth-health.ts";
import { buildDashboardAlerts } from "../src/lib/dashboard-alerts.ts";

const NOW = Date.parse("2026-11-09T12:00:00.000Z");
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

function booth(overrides: Partial<Parameters<typeof buildBoothHealth>[0][number]> = {}) {
  return {
    id: "box-1",
    name: "Booth 01",
    slug: "booth-01",
    outletName: "Malioboro",
    status: "online",
    lastHeartbeatAt: minutesAgo(1),
    hasDefaultTemplate: true,
    ...overrides,
  };
}

test("minutesSince / daysUntil: input kosong atau invalid → null, bukan 0 palsu", () => {
  assert.equal(minutesSince(null, NOW), null);
  assert.equal(minutesSince("bukan-tanggal", NOW), null);
  assert.equal(daysUntil(null, NOW), null);
  assert.equal(daysUntil("nope", NOW), null);
  assert.equal(minutesSince(minutesAgo(12), NOW), 12);
  assert.equal(daysUntil(new Date(NOW + 3 * 86_400_000).toISOString(), NOW), 3);
});

test("health: booth tanpa heartbeat tidak dianggap stale (booth baru tidak membanjiri alert)", () => {
  const health = buildBoothHealth([booth({ lastHeartbeatAt: null })], NOW);
  assert.equal(health.stale.length, 0);
  assert.equal(health.items[0]!.offlineMinutes, null);
});

test("health: heartbeat > 10 menit → stale; maintenance dikecualikan", () => {
  const health = buildBoothHealth(
    [
      booth({ id: "a", lastHeartbeatAt: minutesAgo(BOOTH_STALE_MINUTES + 1) }),
      booth({ id: "b", status: "maintenance", lastHeartbeatAt: minutesAgo(60) }),
      booth({ id: "c", lastHeartbeatAt: minutesAgo(2) }),
    ],
    NOW
  );
  assert.deepEqual(
    health.stale.map((item) => item.id),
    ["a"]
  );
  assert.equal(health.maintenance, 1);
  assert.equal(health.total, 3);
});

test("health: booth tanpa default template ditandai needsDefaultTemplate", () => {
  const health = buildBoothHealth([booth({ hasDefaultTemplate: false })], NOW);
  assert.equal(health.items[0]!.needsDefaultTemplate, true);
});

test("alerts: kosong saat semua sehat (tidak ada alert palsu)", () => {
  const alerts = buildDashboardAlerts({
    staleBooths: [],
    failedPayments: 0,
    storage: { percent: 10, usedMb: 10, limitMb: 100 },
    subscriptionDaysLeft: 30,
    boothsWithoutDefaultTemplate: 0,
  });
  assert.deepEqual(alerts, []);
});

test("alerts: lima pemicu sesuai ambang, urut danger → warning → info", () => {
  const alerts = buildDashboardAlerts({
    staleBooths: [{ name: "Booth 01", offlineMinutes: 42 }],
    failedPayments: 3,
    storage: { percent: STORAGE_ALERT_PERCENT, usedMb: 800, limitMb: 1000 },
    subscriptionDaysLeft: SUBSCRIPTION_ALERT_DAYS,
    boothsWithoutDefaultTemplate: 2,
  });
  assert.deepEqual(
    alerts.map((alert) => alert.key),
    [
      "booth_offline",
      "payment_failed",
      "storage_high",
      "subscription_expiring",
      "booth_no_template",
    ]
  );
  assert.equal(alerts[0]!.tone, "danger");
  assert.equal(alerts[2]!.tone, "warning");
  assert.equal(alerts[4]!.tone, "info");
  assert.match(alerts[0]!.detail, /42 mnt/);
});

test("alerts: storage di bawah 80% dan langganan > 7 hari tidak memicu alert", () => {
  const alerts = buildDashboardAlerts({
    staleBooths: [],
    failedPayments: 0,
    storage: { percent: STORAGE_ALERT_PERCENT - 1, usedMb: 790, limitMb: 1000 },
    subscriptionDaysLeft: SUBSCRIPTION_ALERT_DAYS + 1,
    boothsWithoutDefaultTemplate: 0,
  });
  assert.deepEqual(alerts, []);
});

test("alerts: langganan lewat tanggal jadi danger, bukan warning", () => {
  const alerts = buildDashboardAlerts({
    staleBooths: [],
    failedPayments: 0,
    storage: null,
    subscriptionDaysLeft: 0,
    boothsWithoutDefaultTemplate: 0,
  });
  assert.equal(alerts[0]!.key, "subscription_expiring");
  assert.equal(alerts[0]!.tone, "danger");
});

test("dashboard page: blok operasional TIDAK di dalam cabang finansial", async () => {
  const page = await readFile("src/app/(dashboard)/dashboard/page.tsx", "utf8");
  // Metrik operasional dihitung sebelum cabang financialAccess.
  const metricsIndex = page.indexOf("getOperationalMetrics(user.id, businessId, range)");
  const branchIndex = page.indexOf("const financial = financialAccess");
  assert.ok(metricsIndex > 0 && branchIndex > 0);
  assert.ok(metricsIndex < branchIndex, "metrik operasional harus dihitung untuk semua role");
  // Blok booth + alert dirender di luar ternary finansial.
  const boothIndex = page.indexOf("<BoothStatusGrid");
  const alertIndex = page.indexOf("<AlertStrip");
  const ternaryIndex = page.indexOf("!financialAccess || !summary");
  assert.ok(boothIndex > 0 && alertIndex > 0);
  assert.ok(boothIndex < ternaryIndex && alertIndex < ternaryIndex);
  assert.doesNotMatch(
    page,
    /metrics = await getOperationalMetrics\(user\.id, businessId, range\);?\s*}\s*else/
  );
});

test("dashboard page: memakai delta dan breakdown, bukan metrik mentah saja", async () => {
  const page = await readFile("src/app/(dashboard)/dashboard/page.tsx", "utf8");
  assert.match(page, /getRevenueDelta/);
  assert.match(page, /deltaBp=/);
  assert.match(page, /getDashboardBreakdowns/);
  assert.match(page, /<BreakdownPanel/);
});

test("komponen baru Brutalist: border-2 ink + hard shadow, tanpa rounded/gradient", async () => {
  for (const file of [
    "src/components/dashboard/BoothStatusGrid.tsx",
    "src/components/dashboard/AlertStrip.tsx",
    "src/components/dashboard/BreakdownPanel.tsx",
    "src/components/dashboard/MetricCard.tsx",
  ]) {
    const src = await readFile(file, "utf8");
    assert.match(src, /border-2 border-ink/, `${file} wajib border-2 border-ink`);
    assert.match(
      src,
      /shadow-\[2px_2px_0_0_#111111\]|shadow-\[4px_4px_0_0_#111111\]/,
      `${file} wajib hard shadow`
    );
    assert.doesNotMatch(src, /rounded-(sm|md|lg|xl|2xl|3xl|full)/, `${file} tidak boleh rounded`);
    assert.doesNotMatch(src, /(bg|from|via|to)-gradient/, `${file} tidak boleh gradient`);
  }
});

test("satu ukuran tombol per baris: TemplatesGrid memakai IconButton/IconLink compact + size=sm", async () => {
  const grid = await readFile("src/components/dashboard/TemplatesGrid.tsx", "utf8");
  assert.match(grid, /IconLink/);
  assert.match(grid, /size="sm"/);
  assert.doesNotMatch(
    grid,
    /buttonVariants\(\{ variant: "outline", size: "sm" \}\)/,
    "link teks lama harus jadi ikon compact"
  );
  // Tidak ada campuran ikon non-compact (44px) di baris aksi.
  const nonCompact = [...grid.matchAll(/<Icon(?:Button|Link)\b[\s\S]{0,320}?\/>/g)].filter(
    (match) => !/compact/.test(match[0])
  );
  assert.deepEqual(
    nonCompact.map((m) => m[0].slice(0, 40)),
    []
  );
});

test("lantai harga paket = lantai produk POS (satu konstanta)", async () => {
  const formUi = await readFile("src/lib/form-ui.ts", "utf8");
  const pkg = await readFile("src/components/dashboard/PackageFields.tsx", "utf8");
  const pos = await readFile("src/components/dashboard/PosProductFields.tsx", "utf8");
  const validators = await readFile("src/lib/validators.ts", "utf8");
  assert.match(formUi, /IDR_PRICE_FLOOR = 1000/);
  assert.match(pkg, /min=\{IDR_PRICE_FLOOR\}/);
  assert.match(pos, /min=\{IDR_PRICE_FLOOR\}/);
  // Field harga (bukan jumlah foto/cetak) tidak boleh lagi memakai min=1.
  assert.match(pkg, /name="price"[\s\S]{0,120}?min=\{IDR_PRICE_FLOOR\}/);
  assert.match(validators, /packageCreateSchema[\s\S]*?min\(1000/);
});

test("CollapsibleTrigger: satu bentuk, chevron bawaan, tanpa override padding per halaman", async () => {
  const trigger = await readFile("src/components/ui/collapsible.tsx", "utf8");
  assert.match(trigger, /ChevronDown/);
  assert.match(trigger, /data-panel-open/);
  for (const file of [
    "src/components/dashboard/PackagesTable.tsx",
    "src/components/dashboard/VouchersTable.tsx",
    "src/components/dashboard/PosProductsTable.tsx",
    "src/components/dashboard/PhotoboxesTable.tsx",
    "src/components/dashboard/OutletsTable.tsx",
    "src/components/dashboard/ExpensesPanel.tsx",
    "src/components/dashboard/TransactionsView.tsx",
    "src/components/dashboard/SupportTicketsPanel.tsx",
  ]) {
    const src = await readFile(file, "utf8");
    assert.doesNotMatch(
      src,
      /<CollapsibleTrigger\s+className=/,
      `${file} tidak boleh override padding trigger`
    );
  }
});

test("server dashboard: delta memakai rentang sebelumnya dengan panjang sama", async () => {
  const src = await readFile("src/server/dashboard.ts", "utf8");
  assert.match(src, /export async function getBoothHealth/);
  assert.match(src, /export async function getDashboardAlerts/);
  assert.match(src, /export async function getRevenueDelta/);
  assert.match(src, /export async function getRevenueBreakdown/);
  assert.match(src, /rpc\("revenue_breakdown"/);
  assert.match(src, /shiftISO\(range\.from, -1\)/);
  assert.match(src, /growthBp\(current\.net, previous\.net\)/);
  // Breakdown hanya lewat satu implementasi (analytics men-delegasikan).
  const analytics = await readFile("src/server/analytics.ts", "utf8");
  assert.doesNotMatch(analytics, /rpc\("revenue_breakdown"/);
});
