/**
 * Perhitungan murni subscription — docs/02 (billing), docs/12 Phase 10.
 * Uang integer IDR; periode fixed days per siklus (0093).
 */

export const PERIOD_DAYS = 30;

/**
 * Siklus billing plan (0093). `monthly` = 30 hari (perilaku lama), `yearly`
 * = 365 hari; `daily`/`weekly` untuk langganan jangka pendek.
 */
export type BillingCycle = "daily" | "weekly" | "monthly" | "yearly";

export const BILLING_CYCLES: readonly BillingCycle[] = [
  "daily",
  "weekly",
  "monthly",
  "yearly",
];

const CYCLE_DAYS: Record<BillingCycle, number> = {
  daily: 1,
  weekly: 7,
  monthly: PERIOD_DAYS,
  yearly: 365,
};

const CYCLE_UNIT: Record<BillingCycle, string> = {
  daily: "hari",
  weekly: "minggu",
  monthly: "bulan",
  yearly: "tahun",
};

const CYCLE_LABEL: Record<BillingCycle, string> = {
  daily: "Harian",
  weekly: "Mingguan",
  monthly: "Bulanan",
  yearly: "Tahunan",
};

export function isBillingCycle(value: unknown): value is BillingCycle {
  return typeof value === "string" && Object.hasOwn(CYCLE_DAYS, value);
}

/** Normalisasi nilai DB/intent lama: tidak dikenal → `monthly` (fail-safe). */
export function normalizeCycle(value: string | null | undefined): BillingCycle {
  return isBillingCycle(value) ? value : "monthly";
}

export function cycleDays(cycle: string | null | undefined): number {
  return CYCLE_DAYS[normalizeCycle(cycle)];
}

/** Unit harga untuk copy UI: "hari" | "minggu" | "bulan" | "tahun". */
export function cycleUnit(cycle: string | null | undefined): string {
  return CYCLE_UNIT[normalizeCycle(cycle)];
}

/** Label admin: "Harian" | "Mingguan" | "Bulanan" | "Tahunan". */
export function cycleLabel(cycle: string | null | undefined): string {
  return CYCLE_LABEL[normalizeCycle(cycle)];
}

/** Periode baru untuk siklus tertentu. */
export function cyclePeriod(
  now: Date,
  cycle: string | null | undefined
): { start: Date; end: Date } {
  return nextPeriod(now, cycleDays(cycle));
}

export type CyclePrices = {
  price_daily: number | null;
  price_weekly: number | null;
  price_monthly: number | null;
  price_yearly: number | null;
};

const CYCLE_PRICE_KEY: Record<BillingCycle, keyof CyclePrices> = {
  daily: "price_daily",
  weekly: "price_weekly",
  monthly: "price_monthly",
  yearly: "price_yearly",
};

/** Harga add-on untuk siklus; null = add-on tidak dijual untuk siklus itu. */
export function addOnPriceForCycle(
  prices: CyclePrices,
  cycle: string | null | undefined
): number | null {
  const value = prices[CYCLE_PRICE_KEY[normalizeCycle(cycle)]];
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

/** Setara bulanan (30 hari) untuk MRR/hero — selalu integer IDR. */
export function monthlyEquivalent(price: number, cycle: string | null | undefined): number {
  if (!Number.isFinite(price) || price < 0) return 0;
  return Math.round((price * PERIOD_DAYS) / cycleDays(cycle));
}

/** Periode baru: start = now, end = now + days (default 30 hari). */
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
 * Quantity add-on yang menambah SEAT (device online). Hanya add-on aktif
 * ber-kode `extra_session` yang berkontribusi (docs/02 §2.9); add-on lain
 * (POS, storage) TIDAK boleh menggelembungkan kuota sesi tampilan.
 */
export function sessionAddOnQuantities(addOns: { code: string; quantity: number }[]): number[] {
  return addOns.filter((a) => a.code === "extra_session").map((a) => a.quantity);
}

/**
 * Add-on ber-unit `feature` (mis. POS) adalah entitlement biner — quantity > 1
 * tidak punya arti dan berujung overcharge. Unit `session`/`storage` boleh > 1.
 */
export function addOnQuantityAllowed(unit: string | null | undefined, qty: number): boolean {
  if (unit === "feature") return qty === 1;
  return true;
}

/**
 * Grace period past_due sebelum akses dicabut (docs/02 §2.4).
 * Configurable via platform_settings; default 7 hari. Untuk siklus pendek
 * (harian) grace dibatasi panjang periode agar tidak memberi akses gratis
 * berlipat (0093).
 */
export const PAST_DUE_GRACE_DAYS = 7;

export function pastDueGraceDays(cycle: string | null | undefined): number {
  return Math.min(PAST_DUE_GRACE_DAYS, cycleDays(cycle));
}

/**
 * Cek apakah subscription masih efektif secara waktu.
 * Gate tunggal: status DB + tanggal kedaluwarsa diperiksa bersama.
 * Status string saja TIDAK cukup — trial/past_due bisa expired secara waktu
 * sebelum cron sempat mentransisi status di DB.
 *
 * `billingCycle` menentukan grace `past_due` (min 7 hari / panjang periode);
 * nilai lama/tidak dikenal jatuh ke `monthly` (30 hari).
 *
 * Dipakai oleh: getPlanLimits, hasPosEntitlement, getActiveSubscription, dan cron lifecycle.
 */
export function isSubscriptionEffective(
  status: string,
  trialEndsAt: string | null,
  currentPeriodEnd: string | null,
  now: Date = new Date(),
  billingCycle: string | null = "monthly"
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
    const graceMs = pastDueGraceDays(billingCycle) * 86_400_000;
    return nowMs <= p + graceMs;
  }

  return false;
}
