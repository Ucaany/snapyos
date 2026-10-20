/**
 * Entitlement gate POS — docs/pos/01 §1 A7, docs/pos/02 §4.
 * SATU gerbang: dipanggil baris pertama SEMUA server action/fungsi POS.
 * Layout guard hanya UX — keamanan di sini.
 */

import "server-only";

import { cache } from "react";
import { createServerClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/api-errors";
import { can } from "@/lib/rbac";
import { getMembership, type Membership } from "@/lib/tenant";
import { evaluatePosEntitlement, type PosEntitlementAddOnRow } from "@/lib/pos-entitlement";
import { isSubscriptionEffective } from "@/lib/subscription-math";

export const hasPosEntitlement = cache(async (businessId: string): Promise<boolean> => {
  const supabase = createServerClient();

  // Subscription aktif terbaru (trial/active/past_due) — pola loadActiveSubscription.
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("id, status, trial_ends_at, current_period_end")
    .eq("business_id", businessId)
    .in("status", ["trial", "active", "past_due"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!sub) return false;

  const subRow = sub as {
    id: string;
    status: string;
    trial_ends_at: string | null;
    current_period_end: string | null;
  };

  // Date check: status string saja tidak cukup (AGENTS.md §Resolusi Konflik).
  if (!isSubscriptionEffective(subRow.status, subRow.trial_ends_at, subRow.current_period_end)) {
    return false;
  }

  const { data: rows } = await supabase
    .from("subscription_add_ons")
    .select("status, add_ons ( code, is_active )")
    .eq("subscription_id", subRow.id);

  const addOnRows = (
    (rows ?? []) as unknown as {
      status: string;
      add_ons: { code: string; is_active: boolean } | { code: string; is_active: boolean }[] | null;
    }[]
  ).map<PosEntitlementAddOnRow>((r) => {
    const a = r.add_ons && !Array.isArray(r.add_ons) ? r.add_ons : null;
    return { status: r.status, addOnCode: a?.code ?? null, addOnActive: a?.is_active ?? null };
  });

  return evaluatePosEntitlement(subRow.status, addOnRows);
});

/**
 * Info add-on POS untuk halaman aktivasi — harga dari DB (admin-configurable),
 * frontend tidak pernah hardcode harga (docs/pos/02 §6).
 */
export async function getPosAddOnInfo(): Promise<{
  priceMonthly: number;
  isActive: boolean;
} | null> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("add_ons")
    .select("price_monthly, is_active")
    .eq("code", "pos")
    .maybeSingle();
  if (!data) return null;
  return {
    priceMonthly: (data as { price_monthly: number }).price_monthly,
    isActive: (data as { is_active: boolean }).is_active,
  };
}

/**
 * requirePosAccess(userId, businessId) — docs/pos/02 §4.
 * 1. membership → non-member 404 (anti existence-leak)
 * 2. tanpa pos:read → 404 (konsisten: akses tak berhak = tidak ada)
 * 3. tanpa entitlement → POS_NOT_SUBSCRIBED 403
 */
export async function requirePosAccess(userId: string, businessId: string): Promise<Membership> {
  const membership = await getMembership(userId, businessId);
  if (!membership) throw new ApiError("NOT_FOUND", "Business tidak ditemukan");
  if (!can(membership.role, "pos:read")) {
    throw new ApiError("NOT_FOUND", "Business tidak ditemukan");
  }
  if (!(await hasPosEntitlement(businessId))) {
    throw new ApiError("POS_NOT_SUBSCRIBED", "Add-on POS belum aktif untuk business ini");
  }
  return membership;
}
