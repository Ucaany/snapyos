/**
 * Dashboard queries — docs/08 §8.5, docs/12 Phase 2 (AC 35–38).
 * Semua query scoped business_id + membership check (docs/03 §3.5).
 * RBAC: financial (dashboard/revenue) butuh transaction:read — staff tidak
 * punya (docs/09). transactions = source of truth reporting (docs/07).
 */

import "server-only";
import { createServerClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/api-errors";
import { can, type BusinessRole } from "@/lib/rbac";
import { getMembership } from "@/lib/tenant";
import {
  avgTransactionInteger,
  defaultRange,
  fillDailySeriesFromDays,
  growthBp,
  rangeBoundariesTz,
  rangeDays,
  shiftISO,
  startOfDayTz,
  todayISO,
  coerceDateFields,
  MAX_RANGE_DAYS,
  type DateRangeInput,
} from "@/lib/dashboard-math";
import { buildBoothHealth, daysUntil, type BoothHealth } from "@/lib/booth-health";
import {
  buildDashboardAlerts,
  type DashboardAlert,
  type DashboardAlertInput,
} from "@/lib/dashboard-alerts";
import { getStorageUsage } from "@/server/storage-usage";
import { listAssignedPhotoboxIds } from "@/server/staff";

type ResolvedRange = { from: string; to: string; timeZone: string };

/** Validasi + default rentang terhadap timezone business. */
export async function resolveRange(
  userId: string,
  businessId: string,
  query: DateRangeInput
): Promise<{ range: ResolvedRange; role: BusinessRole }> {
  const membership = await getMembership(userId, businessId);
  if (!membership) throw new ApiError("NOT_FOUND", "Business tidak ditemukan");

  // Safe-parse: tanggal berformat salah (mis. ?from=abc) DIBUANG → jatuh ke
  // default, bukan melempar ZodError yang menjatuhkan halaman via error boundary.
  const parsed = coerceDateFields(query);
  const tz = membership.business.timezone || "Asia/Jakarta";
  const fallback = defaultRange(todayISO(tz));
  // Normalisasi SETELAH merge default: ?to= saja (atau ?from= masa depan)
  // bisa menghasilkan from > to. URL adalah input yang bisa diketik/di-bookmark,
  // jadi rentang terbalik di-SWAP (bukan melempar error boundary di RSC render —
  // halaman harus tetap tampil). Server tetap scoped business_id + membership.
  const rawFrom = parsed.from ?? fallback.from;
  const rawTo = parsed.to ?? fallback.to;
  let from = rawFrom <= rawTo ? rawFrom : rawTo;
  const to = rawFrom <= rawTo ? rawTo : rawFrom;
  // Rentang terlalu panjang di-clamp ke MAX_RANGE_DAYS terakhir (bukan error).
  if (rangeDays(from, to) > MAX_RANGE_DAYS) {
    from = shiftISO(to, -(MAX_RANGE_DAYS - 1));
  }
  return { range: { from, to, timeZone: tz }, role: membership.role };
}

function requireTransactionRead(role: BusinessRole) {
  if (!can(role, "transaction:read")) {
    throw new ApiError("FORBIDDEN", "Anda tidak punya akses data finansial");
  }
}

type TxSummary = { gross: number; discount: number; net: number; paid_tx: number };

/** Agregat SUM/COUNT via RPC (migrasi 0032) — tanpa transfer baris. */
async function fetchTxSummary(
  businessId: string,
  startIso: string,
  endIso: string
): Promise<TxSummary> {
  const supabase = createServerClient();
  const { data, error } = await supabase.rpc("dashboard_tx_summary", {
    p_business: businessId,
    p_start: startIso,
    p_end: endIso,
  });
  if (error) throw new ApiError("INTERNAL", "Gagal memuat transaksi");
  const row = ((data ?? []) as TxSummary[])[0];
  return {
    gross: Number(row?.gross ?? 0),
    discount: Number(row?.discount ?? 0),
    net: Number(row?.net ?? 0),
    paid_tx: Number(row?.paid_tx ?? 0),
  };
}

export type DashboardSummary = {
  range: { from: string; to: string };
  gross: number;
  discount: number;
  net: number;
  paidTx: number;
  avgTransaction: number;
  revenueToday: number;
  revenueMonth: number;
};

/** GET /dashboard — metric cards (docs/04 §4.1). */
export async function getDashboardSummary(
  userId: string,
  businessId: string,
  query: DateRangeInput
): Promise<DashboardSummary> {
  const { range, role } = await resolveRange(userId, businessId, query);
  requireTransactionRead(role);

  const { startMs, endMs } = rangeBoundariesTz(range.from, range.to, range.timeZone);
  const sum = await fetchTxSummary(
    businessId,
    new Date(startMs).toISOString(),
    new Date(endMs).toISOString()
  );

  // Hari Ini / Bulan Ini = hari kalender bisnis (INDEPENDEN dari rentang filter
  // — ?from=bulan-lalu tidak boleh meng-nol-kan kartu hari ini).
  const todayKey = todayISO(range.timeZone);
  const monthKey = todayKey.slice(0, 7);
  const supabase = createServerClient();
  const { data: dayRows, error: dayError } = await supabase.rpc("dashboard_daily_revenue", {
    p_business: businessId,
    p_start: new Date(startOfDayTz(`${monthKey}-01`, range.timeZone)).toISOString(),
    p_end: new Date(Date.now() + 3_600_000).toISOString(),
    p_tz: range.timeZone,
  });
  if (dayError) throw new ApiError("INTERNAL", "Gagal memuat transaksi");
  let revenueToday = 0;
  let revenueMonth = 0;
  for (const d of (dayRows ?? []) as { day: string; amount: number }[]) {
    const amount = Number(d.amount ?? 0);
    revenueMonth += amount;
    if (d.day === todayKey) revenueToday += amount;
  }

  const paidTx = sum.paid_tx;
  return {
    range: { from: range.from, to: range.to },
    gross: sum.gross,
    discount: sum.discount,
    net: sum.net,
    paidTx,
    avgTransaction: avgTransactionInteger(sum.net, paidTx),
    revenueToday,
    revenueMonth,
  };
}

export type RevenueSeries = {
  range: { from: string; to: string };
  total: number;
  series: { date: string; amount: number }[];
};

/** GET /analytics/revenue — deret harian (zero-filled) untuk chart. */
export async function getRevenueSeries(
  userId: string,
  businessId: string,
  query: DateRangeInput
): Promise<RevenueSeries> {
  const { range, role } = await resolveRange(userId, businessId, query);
  requireTransactionRead(role);

  const { startMs, endMs } = rangeBoundariesTz(range.from, range.to, range.timeZone);
  const supabase = createServerClient();
  const { data, error } = await supabase.rpc("dashboard_daily_revenue", {
    p_business: businessId,
    p_start: new Date(startMs).toISOString(),
    p_end: new Date(endMs).toISOString(),
    p_tz: range.timeZone,
  });
  if (error) throw new ApiError("INTERNAL", "Gagal memuat deret revenue");
  const series = fillDailySeriesFromDays(
    ((data ?? []) as { day: string; amount: number }[]).map((d) => ({
      date: d.day,
      amount: Number(d.amount ?? 0),
    })),
    range.from,
    range.to
  );
  return {
    range: { from: range.from, to: range.to },
    total: series.reduce((s, p) => s + p.amount, 0),
    series,
  };
}

export type OperationalMetrics = {
  range: { from: string; to: string };
  sessions: number;
  customers: number;
  activePhotoboxes: number;
  activeOutlets: number;
};

/** GET /metrics — counts operasional (docs/04 §4.3). */
export async function getOperationalMetrics(
  userId: string,
  businessId: string,
  query: DateRangeInput
): Promise<OperationalMetrics> {
  const { range, role } = await resolveRange(userId, businessId, query);
  if (!can(role, "outlet:read")) {
    throw new ApiError("FORBIDDEN", "Anda tidak punya akses metrik ini");
  }

  const { startMs, endMs } = rangeBoundariesTz(range.from, range.to, range.timeZone);
  const fromIso = new Date(startMs).toISOString();
  const toIso = new Date(endMs).toISOString();

  // Konsolidasi 4× head-count menjadi 1 RPC (migrasi 0037).
  const supabase = createServerClient();
  const { data, error } = await supabase.rpc("operational_metrics", {
    p_business: businessId,
    p_start: fromIso,
    p_end: toIso,
  });
  if (error) throw new ApiError("INTERNAL", "Gagal memuat metrik");
  const row = (
    (data ?? []) as {
      sessions: number | string;
      customers: number | string;
      active_photoboxes: number | string;
      active_outlets: number | string;
    }[]
  )[0];

  return {
    range: { from: range.from, to: range.to },
    sessions: Number(row?.sessions ?? 0),
    customers: Number(row?.customers ?? 0),
    activePhotoboxes: Number(row?.active_photoboxes ?? 0),
    activeOutlets: Number(row?.active_outlets ?? 0),
  };
}

/** Jendela payment gagal yang dihitung alert. */
const FAILED_PAYMENT_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Kesehatan booth: heartbeat device terbaru + template default.
 * Operasional (photobox:read) — dipakai SEMUA role dashboard, bukan finansial.
 */
export async function getBoothHealth(
  userId: string,
  businessId: string
): Promise<BoothHealth & { nowMs: number }> {
  const membership = await getMembership(userId, businessId);
  if (!membership) throw new ApiError("NOT_FOUND", "Business tidak ditemukan");
  if (!can(membership.role, "photobox:read")) {
    throw new ApiError("FORBIDDEN", "Anda tidak punya akses status booth");
  }

  const supabase = createServerClient();
  // Akses booth per member (0018): staff hanya melihat booth yang di-assign.
  const restrictTo =
    membership.role === "staff"
      ? ((await listAssignedPhotoboxIds(userId, businessId)) ?? [])
      : null;
  if (restrictTo && restrictTo.length === 0) {
    const nowMs = Date.now();
    return { ...buildBoothHealth([], nowMs), nowMs };
  }

  let boxReq = supabase
    .from("photoboxes")
    .select("id, name, slug, status, default_template_id, outlet_id, outlets ( name )")
    .eq("business_id", businessId);
  if (restrictTo) boxReq = boxReq.in("id", restrictTo);
  const { data: boxRows, error: boxError } = await boxReq.order("name", { ascending: true });
  if (boxError) throw new ApiError("INTERNAL", "Gagal memuat status booth");

  const boxes = (
    (boxRows ?? []) as unknown as {
      id: string;
      name: string;
      slug: string;
      status: string;
      default_template_id: string | null;
      outlets: { name: string } | { name: string }[] | null;
    }[]
  ).map((box) => ({
    id: box.id,
    name: box.name,
    slug: box.slug,
    status: box.status,
    outletName: Array.isArray(box.outlets)
      ? (box.outlets[0]?.name ?? null)
      : (box.outlets?.name ?? null),
    hasDefaultTemplate: Boolean(box.default_template_id),
  }));

  const heartbeatByBox = new Map<string, string>();
  if (boxes.length > 0) {
    // Heartbeat device = sumber kebenaran "booth hidup" (0027); photoboxes.status
    // hanya status administratif yang di-set manual.
    const { data: deviceRows } = await supabase
      .from("devices")
      .select("photobox_id, last_seen_at, last_heartbeat_at")
      .eq("business_id", businessId)
      .eq("status", "active")
      .in(
        "photobox_id",
        boxes.map((box) => box.id)
      );
    for (const row of (deviceRows ?? []) as {
      photobox_id: string;
      last_seen_at: string | null;
      last_heartbeat_at: string | null;
    }[]) {
      const latest = row.last_heartbeat_at ?? row.last_seen_at;
      if (!latest) continue;
      const previous = heartbeatByBox.get(row.photobox_id);
      if (!previous || Date.parse(latest) > Date.parse(previous)) {
        heartbeatByBox.set(row.photobox_id, latest);
      }
    }
  }

  const nowMs = Date.now();
  return {
    ...buildBoothHealth(
      boxes.map((box) => ({
        ...box,
        lastHeartbeatAt: heartbeatByBox.get(box.id) ?? null,
      })),
      nowMs
    ),
    nowMs,
  };
}

/** Alert operasional gabungan (booth, payment, storage, langganan, template). */
export async function getDashboardAlerts(
  userId: string,
  businessId: string,
  dependencies: {
    boothHealth: BoothHealth;
    subscription: {
      status: string;
      trial_ends_at: string | null;
      current_period_end: string | null;
      isEffective: boolean;
    } | null;
  }
): Promise<DashboardAlert[]> {
  const membership = await getMembership(userId, businessId);
  if (!membership) throw new ApiError("NOT_FOUND", "Business tidak ditemukan");

  const supabase = createServerClient();
  let failedPayments = 0;
  // Payment = data finansial: role tanpa transaction:read tidak melihat alert ini.
  if (can(membership.role, "transaction:read")) {
    const { count } = await supabase
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .eq("status", "failed")
      .gte("created_at", new Date(Date.now() - FAILED_PAYMENT_WINDOW_MS).toISOString());
    failedPayments = count ?? 0;
  }

  let storage: DashboardAlertInput["storage"] = null;
  try {
    const usage = await getStorageUsage(businessId);
    storage =
      usage.limitMb > 0
        ? { percent: usage.percent, usedMb: usage.usedMb, limitMb: usage.limitMb }
        : null;
  } catch {
    /* storage gagal dibaca → jangan gagalkan dashboard */
  }

  const endsAt =
    dependencies.subscription?.current_period_end ??
    dependencies.subscription?.trial_ends_at ??
    null;
  const subscriptionDaysLeft = dependencies.subscription?.isEffective
    ? daysUntil(endsAt, Date.now())
    : endsAt
      ? (daysUntil(endsAt, Date.now()) ?? 0)
      : null;

  return buildDashboardAlerts({
    staleBooths: dependencies.boothHealth.stale.map((booth) => ({
      name: booth.name,
      offlineMinutes: booth.offlineMinutes,
    })),
    failedPayments,
    storage,
    subscriptionDaysLeft,
  });
}

export type RevenueDelta = {
  range: { from: string; to: string };
  /** Net periode sebelumnya (rentang sama panjang tepat sebelum `from`). */
  previous: number;
  current: number;
  /** Pertumbuhan basis point integer (growthBp) — 1% = 100 bp. */
  deltaBp: number;
};

/** Delta net vs periode sebelumnya — delta % untuk MetricCard. */
export async function getRevenueDelta(
  userId: string,
  businessId: string,
  query: DateRangeInput
): Promise<RevenueDelta> {
  const { range, role } = await resolveRange(userId, businessId, query);
  requireTransactionRead(role);

  const days = rangeDays(range.from, range.to);
  const previousTo = shiftISO(range.from, -1);
  const previousFrom = shiftISO(previousTo, -(days - 1));
  const currentBoundaries = rangeBoundariesTz(range.from, range.to, range.timeZone);
  const previousBoundaries = rangeBoundariesTz(previousFrom, previousTo, range.timeZone);

  const [current, previous] = await Promise.all([
    fetchTxSummary(
      businessId,
      new Date(currentBoundaries.startMs).toISOString(),
      new Date(currentBoundaries.endMs).toISOString()
    ),
    fetchTxSummary(
      businessId,
      new Date(previousBoundaries.startMs).toISOString(),
      new Date(previousBoundaries.endMs).toISOString()
    ),
  ]);

  return {
    range: { from: range.from, to: range.to },
    current: current.net,
    previous: previous.net,
    deltaBp: growthBp(current.net, previous.net),
  };
}

export type BreakdownDimension = "outlet" | "package" | "photobox" | "payment_method";

export type BreakdownItem = { key: string; label: string; amount: number; count: number };

export type RevenueBreakdown = {
  range: { from: string; to: string };
  total: number;
  items: BreakdownItem[];
};

/**
 * Breakdown revenue per dimensi — RPC `revenue_breakdown` (GROUP BY di DB).
 * Satu implementasi untuk dashboard & analytics (dulu terduplikasi).
 */
export async function getRevenueBreakdown(
  userId: string,
  businessId: string,
  query: DateRangeInput,
  dimension: BreakdownDimension
): Promise<RevenueBreakdown> {
  const { range, role } = await resolveRange(userId, businessId, query);
  requireTransactionRead(role);

  const { startMs, endMs } = rangeBoundariesTz(range.from, range.to, range.timeZone);
  const supabase = createServerClient();
  const { data, error } = await supabase.rpc("revenue_breakdown", {
    p_business: businessId,
    p_start: new Date(startMs).toISOString(),
    p_end: new Date(endMs).toISOString(),
    p_dim: dimension,
  });
  if (error) throw new ApiError("INTERNAL", "Gagal memuat breakdown revenue");

  const items = (
    (data ?? []) as { dim_key: string; label: string; amount: number; tx_count: number }[]
  )
    .map((row) => ({
      key: row.dim_key,
      label: row.label,
      amount: Number(row.amount ?? 0),
      count: Number(row.tx_count ?? 0),
    }))
    .sort((a, b) => b.amount - a.amount);

  return {
    range: { from: range.from, to: range.to },
    total: items.reduce((sum, item) => sum + item.amount, 0),
    items,
  };
}

/** Breakdown paket + outlet + metode bayar sekaligus (dashboard). */
export async function getDashboardBreakdowns(
  userId: string,
  businessId: string,
  query: DateRangeInput
): Promise<{
  package: RevenueBreakdown;
  outlet: RevenueBreakdown;
  paymentMethod: RevenueBreakdown;
}> {
  const [byPackage, byOutlet, byMethod] = await Promise.all([
    getRevenueBreakdown(userId, businessId, query, "package"),
    getRevenueBreakdown(userId, businessId, query, "outlet"),
    getRevenueBreakdown(userId, businessId, query, "payment_method"),
  ]);
  return { package: byPackage, outlet: byOutlet, paymentMethod: byMethod };
}
