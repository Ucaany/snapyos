/**
 * Revenue analytics breakdown — docs/04 §4.2, docs/08 §8.5.
 * GROUP BY di database via RPC (migrasi 0032) — tanpa transfer baris.
 */

import "server-only";
import { createServerClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/api-errors";
import { resolveRange } from "@/server/dashboard";
import { can } from "@/lib/rbac";
import { rangeBoundariesTz, type DateRangeInput } from "@/lib/dashboard-math";
import {
  buildTxInsightsFromGroups,
  type TxInsightGroup,
  type TxInsights,
  type TxStatus,
} from "@/lib/tx-insights";

export type { BreakdownDimension, BreakdownItem, RevenueBreakdown } from "@/server/dashboard";
export { getRevenueBreakdown } from "@/server/dashboard";

/**
 * Tx Insights owner — SEMUA status transaksi + jam ramai + outlet teramai
 * (docs/04 §4.1). Rentang pada created_at agar pending/failed ikut
 * terhitung (paid_at hanya untuk paid). Gating transaction:read — staff
 * tidak melihat (docs/09).
 */
export async function getTxInsights(
  userId: string,
  businessId: string,
  query: DateRangeInput,
  statuses?: TxStatus[]
): Promise<{ range: { from: string; to: string }; insights: TxInsights }> {
  const { range, role } = await resolveRange(userId, businessId, query);
  if (!can(role as "owner" | "manager" | "staff", "transaction:read")) {
    throw new ApiError("FORBIDDEN", "Anda tidak punya akses data finansial");
  }

  const { startMs, endMs } = rangeBoundariesTz(range.from, range.to, range.timeZone);
  const supabase = createServerClient();
  const { data, error } = await supabase.rpc("tx_insights_summary", {
    p_business: businessId,
    p_start: new Date(startMs).toISOString(),
    p_end: new Date(endMs).toISOString(),
    p_tz: range.timeZone,
  });
  if (error) throw new ApiError("INTERNAL", "Gagal memuat insights transaksi");

  const groups: TxInsightGroup[] = (
    (data ?? []) as {
      status: string;
      hr: number;
      outlet_id: string | null;
      outlet_name: string;
      amount: number;
      tx_count: number;
    }[]
  ).map((row) => ({
    status: row.status,
    hr: Number(row.hr ?? 0),
    outlet_id: row.outlet_id ?? null,
    outlet_name: row.outlet_name ?? "Tanpa outlet",
    amount: Number(row.amount ?? 0),
    tx_count: Number(row.tx_count ?? 0),
  }));

  const filtered = statuses
    ? groups.filter((g) => statuses.includes(g.status as TxStatus))
    : groups;

  return {
    range: { from: range.from, to: range.to },
    insights: buildTxInsightsFromGroups(filtered),
  };
}

/**
 * Tx Insights PAID-ONLY — jam ramai & outlet dari transaksi berstatus paid
 * saja (docs/04 §4.1). Delegasi ke getTxInsights dengan filter status.
 * Gating transaction:read.
 */
export async function getPaidTxInsights(
  userId: string,
  businessId: string,
  query: DateRangeInput
): Promise<{ range: { from: string; to: string }; insights: TxInsights }> {
  return getTxInsights(userId, businessId, query, ["paid"]);
}
