/**
 * Perhitungan murni subscription — docs/02 (billing), docs/12 Phase 10.
 * Uang integer IDR; periode 30 hari (monthly, MVP tanpa proration).
 */

export const PERIOD_DAYS = 30;

/** Periode baru: start = now, end = now + 30 hari (cycle monthly MVP). */
export function nextPeriod(now: Date, days: number = PERIOD_DAYS): { start: Date; end: Date } {
  const ms = now.getTime();
  if (!Number.isFinite(ms)) {
    throw new Error("nextPeriod: waktu tidak valid");
  }
  if (!Number.isInteger(days) || days <= 0) {
    throw new Error("nextPeriod: days harus integer positif");
  }
  return { start: new Date(ms), end: new Date(ms + days * 86_400_000) };
}

/** Nomor invoice unik per business: INV-YYYYMM-#### (seq mulai 1). */
export function invoiceNumber(seq: number, at: Date): string {
  if (!Number.isInteger(seq) || seq <= 0) {
    throw new Error("invoiceNumber: seq harus integer positif");
  }
  const y = at.getUTCFullYear();
  const m = String(at.getUTCMonth() + 1).padStart(2, "0");
  return `INV-${y}${m}-${String(seq).padStart(4, "0")}`;
}

/** Persentase pemakaian kuota (0–100, dibulatkan; max 0 → 100 = penuh). */
export function usagePercent(used: number, max: number): number {
  if (!Number.isInteger(used) || used < 0) return 0;
  if (!Number.isInteger(max) || max <= 0) return 100;
  return Math.min(100, Math.round((used / max) * 100));
}

/** Boleh pindah plan: plan beda & aktif & bukan plan saat ini. */
export function planChangeAllowed(
  currentPlanCode: string | null,
  targetPlanCode: string,
  targetActive: boolean
): boolean {
  return targetActive && targetPlanCode !== currentPlanCode;
}

/** Limit sesi efektif: plan + sum quantity add-on aktif (docs/02 §2.9). */
export function effectiveSessions(planMax: number, addOnQuantities: number[]): number {
  if (!Number.isInteger(planMax) || planMax < 0) return 0;
  const extra = addOnQuantities.reduce((sum, q) => sum + (Number.isInteger(q) && q > 0 ? q : 0), 0);
  return planMax + extra;
}

/**
 * Grace period past_due sebelum akses dicabut (docs/02 §2.4).
 * Configurable via platform_settings; default 7 hari.
 */
export const PAST_DUE_GRACE_DAYS = 7;

/**
 * Cek apakah subscription masih efektif secara waktu.
 * Gate tunggal: status DB + tanggal kedaluwarsa diperiksa bersama.
 * Status string saja TIDAK cukup — trial/past_due bisa expired secara waktu
 * sebelum cron sempat mentransisi status di DB.
 *
 * Dipakai oleh: getPlanLimits, hasPosEntitlement, getActiveSubscription, dan cron lifecycle.
 */
export function isSubscriptionEffective(
  status: string,
  trialEndsAt: string | null,
  currentPeriodEnd: string | null,
  now: Date = new Date()
): boolean {
  if (status === "cancelled" || status === "expired") return false;

  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) return false;

  if (status === "trial") {
    if (!trialEndsAt) return false;
    const t = new Date(trialEndsAt).getTime();
    return Number.isFinite(t) && nowMs <= t;
  }

  if (status === "active") {
    if (!currentPeriodEnd) return false; // fail-closed: tanpa periode → anggap expired
    const p = new Date(currentPeriodEnd).getTime();
    return Number.isFinite(p) && nowMs <= p;
  }

  if (status === "past_due") {
    if (!currentPeriodEnd) return false;
    const p = new Date(currentPeriodEnd).getTime();
    if (!Number.isFinite(p)) return false;
    const graceMs = PAST_DUE_GRACE_DAYS * 86_400_000;
    return nowMs <= p + graceMs;
  }

  return false;
}
