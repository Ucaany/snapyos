/**
 * Server-side feature entitlement gate — docs/02 §2.7.
 * Membaca plans.features dari subscription aktif business lalu
 * throw FEATURE_DISABLED jika fitur tidak aktif.
 *
 * Pola: mirip requirePosAccess (src/server/pos-entitlement.ts).
 * Dipakai baris pertama server action/fungsi yang perlu di-gate.
 *
 * Catatan `pwa_kiosk`: belum di-seed di plan mana pun (`db/schema.sql`),
 * jadi halaman `/dashboard/pwa` praktis tidak terjangkau sampai ada plan
 * yang menyalakannya. Fail-closed sesuai `isFeatureEnabled`.
 */

import "server-only";

import { cache } from "react";
import { createServerClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/api-errors";
import { isSubscriptionEffective } from "@/lib/subscription-math";
import { isFeatureEnabled, type FeatureKey } from "@/lib/feature-gate";

/**
 * Ambil features jsonb dari plan subscription aktif business.
 * Cached per request (React cache).
 */
const getBusinessFeatures = cache(
  async (businessId: string): Promise<Record<string, boolean> | null> => {
    const supabase = createServerClient();
    const { data } = await supabase
      .from("subscriptions")
      .select("status, trial_ends_at, current_period_end, billing_cycle, plans ( features )")
      .eq("business_id", businessId)
      .in("status", ["trial", "active", "past_due"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const row = data as {
      status: string;
      trial_ends_at: string | null;
      current_period_end: string | null;
      billing_cycle: string | null;
      plans: { features: Record<string, boolean> } | { features: Record<string, boolean> }[] | null;
    } | null;

    if (
      !row ||
      !isSubscriptionEffective(
        row.status,
        row.trial_ends_at,
        row.current_period_end,
        new Date(),
        row.billing_cycle
      )
    ) {
      return null;
    }

    const plan = row.plans;
    if (!plan || Array.isArray(plan)) return null;
    return (plan.features as Record<string, boolean>) ?? null;
  }
);

/**
 * Gate: throw FEATURE_DISABLED jika fitur tidak aktif untuk business.
 * Panggil di baris pertama server action/fungsi yang di-gate.
 */
export async function requireFeature(businessId: string, feature: FeatureKey): Promise<void> {
  const features = await getBusinessFeatures(businessId);
  if (!isFeatureEnabled(features, feature)) {
    throw new ApiError(
      "FEATURE_DISABLED",
      `Fitur "${feature}" tidak tersedia di plan Anda. Upgrade untuk mengaktifkan.`
    );
  }
}

/** Non-throwing check — untuk path yang perlu tahu aktif/tidak tanpa throw. */
export async function hasFeature(businessId: string, feature: FeatureKey): Promise<boolean> {
  return isFeatureEnabled(await getBusinessFeatures(businessId), feature);
}
