/**
 * Evaluasi entitlement POS add-on — docs/pos/02 §4, §8.
 * Pure (tanpa supabase) agar unit-testable — pola src/lib/*.
 * Subscription terakhir business wajib trial|active|past_due DAN punya
 * subscription_add_ons aktif yang menunjuk add_ons code='pos' is_active.
 */

export type PosEntitlementAddOnRow = {
  status: string; // subscription_add_ons.status: active | cancelled
  addOnCode: string | null;
  addOnActive: boolean | null;
};

export function evaluatePosEntitlement(
  subscriptionStatus: string | null | undefined,
  addOnRows: readonly PosEntitlementAddOnRow[]
): boolean {
  if (!subscriptionStatus) return false;
  if (!["trial", "active", "past_due"].includes(subscriptionStatus)) return false;
  return addOnRows.some(
    (r) => r.status === "active" && r.addOnCode === "pos" && r.addOnActive === true
  );
}
