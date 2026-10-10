/**
 * Plan limit check murni — docs/02 §2.3, docs/12 Phase 3 (limit ditegakkan).
 * Server menghitung jumlah resource lalu cek terhadap limit plan.
 */

export type PlanLimits = {
  max_outlets: number;
  max_photoboxes: number;
  max_concurrent_sessions: number;
  max_staff: number;
};

/** Default konservatif bila subscription tidak ditemukan (= seed starter). */
export const DEFAULT_PLAN_LIMITS: PlanLimits = {
  max_outlets: 1,
  max_photoboxes: 1,
  max_concurrent_sessions: 1,
  max_staff: 0,
};

/**
 * Cek limit — return kode error standar atau null bila masih dalam batas.
 * count = jumlah resource yang sudah ada (resource baru belum dihitung).
 */
export function planLimitError(count: number, max: number): "PLAN_LIMIT_REACHED" | null {
  if (!Number.isInteger(count) || !Number.isInteger(max) || max < 0) {
    return "PLAN_LIMIT_REACHED";
  }
  return count >= max ? "PLAN_LIMIT_REACHED" : null;
}
