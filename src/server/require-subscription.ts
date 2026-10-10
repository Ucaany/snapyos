/**
 * Subscription lifecycle gate tunggal — docs/02 §2.4.
 * Satu-satunya gerbang date-aware untuk akses dashboard/finance/analytics:
 * status DB + tanggal kedaluwarsa diperiksa bersama via
 * isSubscriptionEffective() (src/lib/subscription-math.ts).
 * Status string saja TIDAK cukup — trial/past_due bisa expired secara waktu
 * sebelum cron mentransisi status di DB.
 *
 * Pola: mirip requireFeature (src/server/feature-gate.ts), tapi tanpa
 * ketergantungan pada plans.features — domain dashboard/metrics/analytics/
 * transactions tidak punya feature key.
 */

import "server-only";

import { cache } from "react";
import { createServerClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/api-errors";
import { isSubscriptionEffective } from "@/lib/subscription-math";

type EffectiveSubscription = {
  id: string;
  status: string;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
};

/**
 * Baris subscription terbaru (trial/active/past_due) untuk business.
 * Cached per request (React cache). Return null bila tidak ada —
 * TANPA melempar, agar caller seperti cancelAddOn tetap bisa bekerja
 * pada subscription yang sudah tidak efektif secara waktu.
 */
export const getEffectiveSubscriptionRow = cache(
  async (businessId: string): Promise<EffectiveSubscription | null> => {
    const supabase = createServerClient();
    const { data } = await supabase
      .from("subscriptions")
      .select("id, status, trial_ends_at, current_period_end")
      .eq("business_id", businessId)
      .in("status", ["trial", "active", "past_due"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const row = (data ?? null) as {
      id: string;
      status: string;
      trial_ends_at: string | null;
      current_period_end: string | null;
    } | null;
    if (!row) return null;
    return {
      id: row.id,
      status: row.status,
      trialEndsAt: row.trial_ends_at,
      currentPeriodEnd: row.current_period_end,
    };
  }
);

/**
 * Gate lifecycle untuk MUTASI owner — dipakai route POST/PATCH/DELETE
 * dan server actions mutasi (bukan GET read-only, supaya owner tetap bisa
 * melihat data untuk memutuskan renew).
 *
 * - mode "read": izinkan trial/active/past_due dalam grace (isEffective).
 * - mode "write": sama dengan read (past_due lewat grace → throw).
 * Semantik identik dengan getActiveSubscription().isEffective
 * (src/server/business.ts) — memakai loader cached yang sama.
 */
export async function requireEffectiveSubscription(
  businessId: string,
  _mode: "read" | "write" = "read"
): Promise<EffectiveSubscription> {
  const row = await getEffectiveSubscriptionRow(businessId);
  if (
    !row ||
    !isSubscriptionEffective(row.status, row.trialEndsAt, row.currentPeriodEnd)
  ) {
    throw new ApiError(
      "SUBSCRIPTION_EXPIRED",
      "Langganan bisnis ini sudah kedaluwarsa. Perpanjang langganan untuk melanjutkan."
    );
  }
  return row;
}
