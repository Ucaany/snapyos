/**
 * Admin add-on ops — decisions attach/cancel subscription_add_ons.
 * Pure module (tanpa supabase) agar unit-testable — pola src/lib/*.
 * Semantik: cancel deferred = parity owner cancelAddOn (subscription.ts),
 * cancel immediate = hanya darurat admin + reason wajib (audit).
 */

import { ApiError } from "./api-errors.ts";

/** Row existing subscription_add_ons — hanya field yang vital keputusan. */
export type AddOnLinkSnapshot = {
  id: string;
  status: string;
};

export type AttachDecision =
  | { kind: "insert"; reactivated: false }
  | { kind: "update_quantity"; reactivated: false }
  | { kind: "reactivate"; reactivated: true };

/**
 * Keputusan attach: row cancelled → reaktivasi (reset status +
 * cancel_at_period_end), row active → hanya qty (behaviour existing).
 */
export function decideAttach(existing: AddOnLinkSnapshot | null): AttachDecision {
  if (!existing) return { kind: "insert", reactivated: false };
  if (existing.status === "cancelled") return { kind: "reactivate", reactivated: true };
  return { kind: "update_quantity", reactivated: false };
}

export type AddOnCancelMode = "deferred" | "immediate";

export type CancelPlan = {
  values: { status: "cancelled" } | { cancel_at_period_end: true };
  auditMeta: { mode: AddOnCancelMode; manual_cancel_reason: string | null };
};

/**
 * Keputusan cancel. Deferred → flag cancel_at_period_end (parity owner,
 * cron transition at period end). Immediate → status cancelled, reason wajib.
 */
export function planCancelAddOn(
  mode: AddOnCancelMode,
  manualCancelReason?: string | null
): CancelPlan {
  if (mode === "immediate") {
    const reason = (manualCancelReason ?? "").trim();
    if (!reason) {
      throw new ApiError("VALIDATION_ERROR", "Alasan wajib untuk cancel segera (audit)");
    }
    return {
      values: { status: "cancelled" },
      auditMeta: { mode, manual_cancel_reason: reason },
    };
  }
  // Finding #10: reason tanpa mode immediate jangan dibuang diam-diam.
  if ((manualCancelReason ?? "").trim()) {
    throw new ApiError("VALIDATION_ERROR", "Alasan hanya dipakai untuk mode SEGERA");
  }
  return {
    values: { cancel_at_period_end: true },
    auditMeta: { mode, manual_cancel_reason: null },
  };
}