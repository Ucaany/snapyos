import "server-only";

import { createServerClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/api-errors";
import {
  coerceDateFields,
  todayISO,
  rangeBoundariesTz,
  type DateRangeInput,
} from "@/lib/dashboard-math";
import { requirePosAccess } from "@/server/pos-entitlement";
import {
  buildPosRevenue,
  buildPosProductBreakdown,
  buildPosLabelBreakdown,
  buildPosDayBreakdown,
  buildPosVsKioskSplit,
  type PosRevenueReport,
  type PosBreakdownRow,
  type PosVsKioskSplit,
} from "@/lib/pos-reports-math";

/**
 * POS reports — docs/pos/05 §4. Gating requirePosAccess + pos:read
 * (staff melihat ringkasan — §7). Range batas business tz (rangeBoundariesTz).
 * REVENUE selalu dari transactions; pos_orders hanya breakdown detail.
 */

/**
 * docs/pos/05 §4 — batas UTC ms dari business tz (pola resolveRange →
 * rangeBoundariesTz). Kosong = semua riwayat (filter tidak diterapkan) agar
 * konsisten dengan label "Dari/Sampai" yang boleh kosong.
 *
 * Safe-parse (coerceDateFields): tanggal berformat salah / kosong DIBUANG →
 * jatuh ke "semua riwayat", bukan melempar ZodError yang menjatuhkan halaman
 * via error boundary (input URL bebas; sejalan dengan dashboard/metrics).
 * Rentang terbalik (from > to) di-SWAP — bukan error boundary (pola
 * resolveRange di src/server/dashboard.ts).
 */
function resolveRange(query: DateRangeInput, tz: string) {
  const parsed = coerceDateFields(query);
  if (!parsed.from && !parsed.to) {
    return { fromIso: null, toIso: null };
  }
  const rawFrom = parsed.from ?? "1970-01-01";
  const rawTo = parsed.to ?? todayISO(tz);
  const from = rawFrom <= rawTo ? rawFrom : rawTo;
  const to = rawFrom <= rawTo ? rawTo : rawFrom;
  const { startMs, endMs } = rangeBoundariesTz(from, to, tz);
  return { fromIso: new Date(startMs).toISOString(), toIso: new Date(endMs).toISOString() };
}

export async function posRevenueReport(
  userId: string,
  businessId: string,
  query: DateRangeInput
): Promise<PosRevenueReport> {
  const membership = await requirePosAccess(userId, businessId);
  const tz = membership.business.timezone || "Asia/Jakarta";
  const { fromIso, toIso } = resolveRange(query, tz);

  const supabase = createServerClient();
  // REVENUE SELALU dari transactions (docs/pos/05 §9 anti double-count);
  // pos_orders hanya dipakai untuk hitung status order.
  let paidReq = supabase
    .from("transactions")
    .select("gross_amount, discount_amount, final_amount, payment_method")
    .eq("business_id", businessId)
    .eq("status", "paid")
    .not("pos_order_id", "is", null);
  let statusReq = supabase.from("pos_orders").select("status").eq("business_id", businessId);
  if (fromIso) paidReq = paidReq.gte("paid_at", fromIso).lt("paid_at", toIso);
  if (fromIso) statusReq = statusReq.gte("created_at", fromIso).lt("created_at", toIso);
  const [paid, statuses] = await Promise.all([paidReq, statusReq]);
  if (paid.error || statuses.error) {
    throw new ApiError("INTERNAL", "Gagal memuat laporan POS");
  }

  return buildPosRevenue(
    (paid.data ?? []) as Parameters<typeof buildPosRevenue>[0],
    (statuses.data ?? []) as { status: string }[]
  );
}

export type PosBreakdownGroupBy = "product" | "cashier" | "outlet" | "booth" | "day";

export async function posBreakdownReport(
  userId: string,
  businessId: string,
  query: DateRangeInput,
  groupBy: PosBreakdownGroupBy
): Promise<PosBreakdownRow[]> {
  const membership = await requirePosAccess(userId, businessId);
  const tz = membership.business.timezone || "Asia/Jakarta";
  const { fromIso, toIso } = resolveRange(query, tz);

  const supabase = createServerClient();

  if (groupBy === "product") {
    // Snapshot name (A9) — bukan nama produk sekarang (docs/pos/05 §4).
    let req = supabase
      .from("pos_order_items")
      .select(
        "name_snapshot, quantity, subtotal, pos_orders!inner ( business_id, status, paid_at )"
      )
      .eq("pos_orders.business_id", businessId)
      .eq("pos_orders.status", "paid");
    if (fromIso) req = req.gte("pos_orders.paid_at", fromIso).lt("pos_orders.paid_at", toIso);
    const { data, error } = await req;
    if (error) throw new ApiError("INTERNAL", "Gagal memuat breakdown produk POS");
    return buildPosProductBreakdown(
      (data ?? []) as { name_snapshot: string; quantity: number; subtotal: number }[]
    );
  }

  if (groupBy === "day") {
    let req = supabase
      .from("pos_orders")
      .select("final_amount, paid_at")
      .eq("business_id", businessId)
      .eq("status", "paid");
    if (fromIso) req = req.gte("paid_at", fromIso).lt("paid_at", toIso);
    const { data, error } = await req;
    if (error) throw new ApiError("INTERNAL", "Gagal memuat breakdown harian POS");
    return buildPosDayBreakdown((data ?? []) as { paid_at: string; final_amount: number }[], tz);
  }

  const joinCol = groupBy === "cashier" ? "users" : groupBy === "outlet" ? "outlets" : "photoboxes";
  let req = supabase
    .from("pos_orders")
    .select(`final_amount, ${joinCol} ( name )`)
    .eq("business_id", businessId)
    .eq("status", "paid");
  if (fromIso) req = req.gte("paid_at", fromIso).lt("paid_at", toIso);
  const { data, error } = await req;
  if (error) throw new ApiError("INTERNAL", "Gagal memuat breakdown POS");

  type JoinName = { name: string } | { name: string }[] | null;
  const name = (j?: JoinName) => (j && !Array.isArray(j) ? j.name : null);
  const rows = ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
    label: name(r[joinCol] as JoinName | undefined) ?? "-",
    final_amount: r.final_amount as number,
  }));

  return buildPosLabelBreakdown(rows);
}

export async function posVsKioskSplit(
  userId: string,
  businessId: string,
  query: DateRangeInput
): Promise<PosVsKioskSplit> {
  const membership = await requirePosAccess(userId, businessId);
  const tz = membership.business.timezone || "Asia/Jakarta";
  const { fromIso, toIso } = resolveRange(query, tz);

  const supabase = createServerClient();
  let req = supabase
    .from("transactions")
    .select("pos_order_id, final_amount")
    .eq("business_id", businessId)
    .eq("status", "paid");
  if (fromIso) req = req.gte("paid_at", fromIso).lt("paid_at", toIso);
  const { data, error } = await req;
  if (error) throw new ApiError("INTERNAL", "Gagal memuat split POS vs kiosk");

  return buildPosVsKioskSplit(
    (data ?? []) as { pos_order_id: string | null; final_amount: number }[]
  );
}
