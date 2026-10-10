/**
 * Admin POS revenue — docs/pos/05 §4 (data layer).
 */

import "server-only";
import { createServerClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/api-errors";
import { requireAdmin } from "./guard";

/**
 * POS revenue per tenant — docs/pos/05 §4. Sumber: transactions paid
 * pos_order_id NOT NULL (bukan pos_orders — anti double-count).
 */
export async function adminPosRevenueSummary(query: {
  from?: string;
  to?: string;
}): Promise<{
  rows: { businessId: string; businessName: string; final: number; count: number }[];
  total: number;
}> {
  await requireAdmin();
  const supabase = createServerClient();

  let req = supabase
    .from("transactions")
    .select("business_id, final_amount, businesses ( name )")
    .eq("status", "paid")
    .not("pos_order_id", "is", null);
  if (query.from) req = req.gte("paid_at", `${query.from}T00:00:00.000Z`);
  if (query.to) req = req.lte("paid_at", `${query.to}T23:59:59.999Z`);
  const { data, error } = await req;
  if (error) throw new ApiError("INTERNAL", "Gagal memuat ringkasan POS");

  const agg = new Map<string, { businessName: string; final: number; count: number }>();
  for (const r of (data ?? []) as unknown as {
    business_id: string;
    final_amount: number;
    businesses: { name: string } | { name: string }[] | null;
  }[]) {
    const name =
      r.businesses && !Array.isArray(r.businesses) ? r.businesses.name : r.business_id;
    const cur = agg.get(r.business_id) ?? { businessName: name, final: 0, count: 0 };
    cur.final += r.final_amount;
    cur.count += 1;
    agg.set(r.business_id, cur);
  }
  const rows = [...agg.entries()]
    .map(([businessId, v]) => ({ businessId, ...v }))
    .sort((a, b) => b.final - a.final);
  return { rows, total: rows.reduce((s, r) => s + r.final, 0) };
}
