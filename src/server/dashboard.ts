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
  rangeBoundariesTz,
  rangeDays,
  startOfDayTz,
  todayISO,
  dateRangeSchema,
  MAX_RANGE_DAYS,
  type DateRangeInput,
} from "@/lib/dashboard-math";

type ResolvedRange = { from: string; to: string; timeZone: string };

/** Validasi + default rentang terhadap timezone business. */
export async function resolveRange(
  userId: string,
  businessId: string,
  query: DateRangeInput
): Promise<{ range: ResolvedRange; role: BusinessRole }> {
  const membership = await getMembership(userId, businessId);
  if (!membership) throw new ApiError("NOT_FOUND", "Business tidak ditemukan");

  const parsed = dateRangeSchema.parse(query);
  const tz = membership.business.timezone || "Asia/Jakarta";
  const fallback = defaultRange(todayISO(tz));
  const from = parsed.from ?? fallback.from;
  const to = parsed.to ?? fallback.to;
  // Re-validasi SETELAH merge default: ?to= saja bisa menghasilkan from > to.
  if (from > to) {
    throw new ApiError("VALIDATION_ERROR", "'from' harus ≤ 'to'");
  }
  if (rangeDays(from, to) > MAX_RANGE_DAYS) {
    throw new ApiError("VALIDATION_ERROR", `Rentang maksimal ${MAX_RANGE_DAYS} hari`);
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
  const { data: dayRows, error: dayError } = await supabase.rpc(
    "dashboard_daily_revenue",
    {
      p_business: businessId,
      p_start: new Date(startOfDayTz(`${monthKey}-01`, range.timeZone)).toISOString(),
      p_end: new Date(Date.now() + 3_600_000).toISOString(),
      p_tz: range.timeZone,
    }
  );
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
  const row = ((data ?? []) as {
    sessions: number | string;
    customers: number | string;
    active_photoboxes: number | string;
    active_outlets: number | string;
  }[])[0];

  return {
    range: { from: range.from, to: range.to },
    sessions: Number(row?.sessions ?? 0),
    customers: Number(row?.customers ?? 0),
    activePhotoboxes: Number(row?.active_photoboxes ?? 0),
    activeOutlets: Number(row?.active_outlets ?? 0),
  };
}
