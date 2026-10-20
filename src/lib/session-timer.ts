/**
 * Session timer — docs/05 §5.1b (server = enforcer, countdown client = UX).
 * Murni (tanpa server-only) agar bisa di-unit-test.
 */

export const DEFAULT_TIMER_SECONDS = 300;
export const DEFAULT_WARNING_SECONDS = 60;

/**
 * Grace window finalize offline: kiosk bisa kehilangan koneksi saat customer
 * sudah menyelesaikan sesi; foto disinkronkan saat online kembali. Server tetap
 * enforcer — finalize ditolak setelah grace ini.
 * Juga threshold self-heal booth: sesi aktif yang lewat expires_at + grace
 * di-expire saat attempt sesi/checkout baru (session-capacity.ts) agar partial
 * unique index 1 sesi aktif/photobox (db/0004) tidak mengunci booth berjam-jam
 * menunggu cron retention harian — booth bisa dipakai kios segera.
 * ponytail: naikkan saat timer panjang + koneksi tidak stabil terbukti umum.
 */
export const OFFLINE_FINALIZE_GRACE_MS = 10 * 60_000;

/** ISO expires_at saat session dibuat (post-paid). */
export function computeExpiresAt(timerSeconds: number, now = Date.now()): string {
  const safe =
    Number.isInteger(timerSeconds) && timerSeconds > 0 ? timerSeconds : DEFAULT_TIMER_SECONDS;
  return new Date(now + safe * 1000).toISOString();
}

export function remainingMs(expiresAt: string, now = Date.now()): number {
  const t = new Date(expiresAt).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, t - now);
}

export function remainingSeconds(expiresAt: string, now = Date.now()): number {
  return Math.ceil(remainingMs(expiresAt, now) / 1000);
}

export function isExpired(expiresAt: string, now = Date.now()): boolean {
  return remainingMs(expiresAt, now) <= 0;
}

/** Warning aktif di sisa waktu terakhir (docs/05 §5.1b `warning_seconds`). */
export function isWarning(expiresAt: string, warningSeconds: number, now = Date.now()): boolean {
  const w =
    Number.isInteger(warningSeconds) && warningSeconds >= 0
      ? warningSeconds
      : DEFAULT_WARNING_SECONDS;
  const left = remainingMs(expiresAt, now);
  return left > 0 && left <= w * 1000;
}

// --- Expiry QRIS (owner-configurable, default 3 menit) — docs/06 §6.3 ---

export const DEFAULT_QRIS_EXPIRY_MINUTES = 3;
export const MIN_QRIS_EXPIRY_MINUTES = 1;
export const MAX_QRIS_EXPIRY_MINUTES = 60;

/** Clamp menit expiry QRIS ke rentang valid (default 3). */
export function clampQrisExpiryMinutes(minutes: number | null | undefined): number {
  if (minutes === null || minutes === undefined) return DEFAULT_QRIS_EXPIRY_MINUTES;
  const n = Number(minutes);
  if (!Number.isFinite(n)) return DEFAULT_QRIS_EXPIRY_MINUTES;
  const m = Math.floor(n);
  if (m < MIN_QRIS_EXPIRY_MINUTES) return MIN_QRIS_EXPIRY_MINUTES;
  if (m > MAX_QRIS_EXPIRY_MINUTES) return MAX_QRIS_EXPIRY_MINUTES;
  return m;
}

/**
 * Expiry QR efektif: min(provider expiry, setting owner).
 * Selama QR hidup tidak bisa buat QR baru — hangus otomatis setelahnya.
 */
export function computeQrisExpiresAt(
  minutes: number | null | undefined,
  providerExpiresAt: string | null,
  now = Date.now()
): string {
  const capMs = now + clampQrisExpiryMinutes(minutes) * 60_000;
  if (!providerExpiresAt) return new Date(capMs).toISOString();
  const t = new Date(providerExpiresAt).getTime();
  if (Number.isNaN(t)) return new Date(capMs).toISOString();
  return new Date(Math.min(t, capMs)).toISOString();
}
