/**
 * Business metrics menyeluruh — docs/04 §4.3, docs/08 §8.5 (GET /metrics).
 * Semua angka konsisten dengan dashboard & transactions (sumber: transactions).
 * Agregasi di database via RPC (migrasi 0032) — tanpa transfer baris.
 */

import "server-only";
import { createServerClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/api-errors";
import { can } from "@/lib/rbac";
import { resolveRange } from "@/server/dashboard";
import {
  growthBp,
  rangeBoundariesTz,
  rangeDays,
  shiftISO,
  type DateRangeInput,
} from "@/lib/dashboard-math";

export type BusinessMetrics = {
  range: { from: string; to: string };
  revenue: {
    gross: number;
    discount: number;
    net: number;
    previousNet: number;
    growthBp: number;
  };
  transactions: {
    total: number;
    paid: number;
    pending: number;
    failed: number;
    cancelled: number;
    refunded: number;
  };
  sessions: {
    total: number;
    completed: number;
    cancelled: number;
    retakes: number;
    avgDurationSeconds: number;
  };
  customers: { total: number; new: number; returning: number };
  photobox: {
    booths: { id: string; name: string; sessions: number; revenue: number }[];
    popularPackage: string | null;
    popularTemplate: string | null;
  };
};

export async function getBusinessMetrics(
  userId: string,
  businessId: string,
  query: DateRangeInput
): Promise<BusinessMetrics> {
  const { range, role } = await resolveRange(userId, businessId, query);
  if (!can(role as "owner" | "manager" | "staff", "transaction:read")) {
    throw new ApiError("FORBIDDEN", "Anda tidak punya akses data finansial");
  }

  const { startMs, endMs } = rangeBoundariesTz(range.from, range.to, range.timeZone);
  const fromIso = new Date(startMs).toISOString();
  const toIso = new Date(endMs).toISOString();

  // Periode sebelumnya: sama panjang, berakhir hari sebelum `from`.
  const days = rangeDays(range.from, range.to);
  const prevFrom = shiftISO(range.from, -days);
  const prevTo = shiftISO(range.from, -1);
  const prev = rangeBoundariesTz(prevFrom, prevTo, range.timeZone);

  const supabase = createServerClient();

  const prevStartIso = new Date(prev.startMs).toISOString();
  const prevEndIso = new Date(prev.endMs).toISOString();

  const [
    txSum,
    txPrev,
    txStatus,
    returning,
    boothRev,
    boothSessions,
    sessionSum,
    popularPkg,
    popularTpl,
    customersTotal,
    customersNew,
    boothsRaw,
  ] = await Promise.all([
    supabase.rpc("dashboard_tx_summary", {
      p_business: businessId,
      p_start: fromIso,
      p_end: toIso,
    }),
    supabase.rpc("dashboard_tx_summary", {
      p_business: businessId,
      p_start: prevStartIso,
      p_end: prevEndIso,
    }),
    supabase.rpc("metrics_tx_status", {
      p_business: businessId,
      p_start: fromIso,
      p_end: toIso,
    }),
    supabase.rpc("metrics_returning_customers", {
      p_business: businessId,
      p_start: fromIso,
      p_end: toIso,
    }),
    supabase.rpc("metrics_revenue_per_booth", {
      p_business: businessId,
      p_start: fromIso,
      p_end: toIso,
    }),
    supabase.rpc("metrics_sessions_per_booth", {
      p_business: businessId,
      p_start: fromIso,
      p_end: toIso,
    }),
    supabase.rpc("metrics_session_summary", {
      p_business: businessId,
      p_start: fromIso,
      p_end: toIso,
    }),
    supabase.rpc("metrics_popular_package", {
      p_business: businessId,
      p_start: fromIso,
      p_end: toIso,
    }),
    supabase.rpc("metrics_popular_template", {
      p_business: businessId,
      p_start: fromIso,
      p_end: toIso,
    }),
    supabase
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId),
    supabase
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .gte("created_at", fromIso)
      .lt("created_at", toIso),
    supabase
      .from("photoboxes")
      .select("id, name")
      .eq("business_id", businessId)
      .order("created_at", { ascending: true }),
  ]);

  if (
    txSum.error ||
    txPrev.error ||
    txStatus.error ||
    returning.error ||
    boothRev.error ||
    boothSessions.error ||
    sessionSum.error ||
    popularPkg.error ||
    popularTpl.error ||
    customersTotal.error ||
    customersNew.error ||
    boothsRaw.error
  ) {
    throw new ApiError("INTERNAL", "Gagal memuat metrik");
  }

  const sum = ((txSum.data ?? []) as { gross: number; discount: number; net: number }[])[0];
  const gross = Number(sum?.gross ?? 0);
  const discount = Number(sum?.discount ?? 0);
  const net = Number(sum?.net ?? 0);
  const prevNet = Number(((txPrev.data ?? []) as { net: number }[])[0]?.net ?? 0);

  const txCounts = { total: 0, paid: 0, pending: 0, failed: 0, cancelled: 0, refunded: 0 };
  for (const row of (txStatus.data ?? []) as { status: string; tx_count: number }[]) {
    const count = Number(row.tx_count ?? 0);
    txCounts.total += count;
    if (row.status === "paid") txCounts.paid += count;
    else if (row.status === "pending") txCounts.pending += count;
    else if (row.status === "failed") txCounts.failed += count;
    else if (row.status === "cancelled") txCounts.cancelled += count;
    else if (row.status === "refunded") txCounts.refunded += count;
  }

  const sess = (
    (sessionSum.data ?? []) as {
      total: number;
      completed: number;
      cancelled: number;
      retakes: number;
      done_count: number;
      total_seconds: number;
    }[]
  )[0];
  const doneCount = Number(sess?.done_count ?? 0);
  const totalSeconds = Number(sess?.total_seconds ?? 0);

  const revByBooth = new Map(
    ((boothRev.data ?? []) as { booth_id: string; revenue: number }[]).map((r) => [
      r.booth_id,
      Number(r.revenue ?? 0),
    ])
  );
  const sessionsByBooth = new Map(
    ((boothSessions.data ?? []) as { booth_id: string; sessions: number }[]).map((r) => [
      r.booth_id,
      Number(r.sessions ?? 0),
    ])
  );

  const popularPackage = ((popularPkg.data ?? []) as { name: string }[])[0]?.name ?? null;
  const popularTemplate = ((popularTpl.data ?? []) as { name: string }[])[0]?.name ?? null;

  const booths = ((boothsRaw.data ?? []) as { id: string; name: string }[]).map((b) => ({
    id: b.id,
    name: b.name,
    sessions: sessionsByBooth.get(b.id) ?? 0,
    revenue: revByBooth.get(b.id) ?? 0,
  }));

  return {
    range: { from: range.from, to: range.to },
    revenue: { gross, discount, net, previousNet: prevNet, growthBp: growthBp(net, prevNet) },
    transactions: txCounts,
    sessions: {
      total: Number(sess?.total ?? 0),
      completed: Number(sess?.completed ?? 0),
      cancelled: Number(sess?.cancelled ?? 0),
      retakes: Number(sess?.retakes ?? 0),
      avgDurationSeconds: doneCount > 0 ? Math.round(totalSeconds / doneCount) : 0,
    },
    customers: {
      total: customersTotal.count ?? 0,
      new: customersNew.count ?? 0,
      returning: Number(returning.data ?? 0),
    },
    photobox: { booths, popularPackage, popularTemplate },
  };
}
