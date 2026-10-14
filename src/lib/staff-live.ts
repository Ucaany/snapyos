/**
 * Pembacaan live shell /staff: jam stasiun, elapsed, sisa sesi.
 * Pure (tanpa React/DOM) supaya bisa di-unit-test dan deterministik saat SSR;
 * dipakai komponen client StationClock/SessionLive.
 */

import { DEFAULT_TZ } from "./dashboard-math.ts";

/**
 * tz valid → apa adanya; tz tak dikenal/kosong → DEFAULT_TZ.
 * `businesses.timezone` hanya divalidasi sebagai string 3–64 char (validators),
 * jadi nilai tak dikenal bisa lolos ke DB, dan Intl melempar RangeError yang
 * mematikan seluruh halaman. Gate di sini, bukan biarkan shell 500.
 */
export function safeTimeZone(timeZone: string | null | undefined): string {
  const tz = timeZone || DEFAULT_TZ;
  try {
    new Intl.DateTimeFormat("id-ID", { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TZ;
  }
}

/** Jam:menit + label zona pada zona bisnis, mis. "20.58" + "WIB" (WITA/WIT ikut). */
export function clockParts(
  date: Date | number | string,
  timeZone: string
): { time: string; zone: string } {
  const value = date instanceof Date ? date : new Date(date);
  const parts = new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: safeTimeZone(timeZone),
    timeZoneName: "short",
  }).formatToParts(value);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return { time: `${pick("hour")}.${pick("minute")}`, zone: pick("timeZoneName") };
}

/** Menit sejak `startISO`; 0 bila timestamp tidak valid (bukan NaN di UI). */
export function elapsedMinutes(startISO: string, nowMs: number): number {
  const startedMs = new Date(startISO).getTime();
  if (Number.isNaN(startedMs)) return 0;
  return Math.max(0, Math.floor((nowMs - startedMs) / 60_000));
}

/**
 * Sisa menit sampai `expiresISO`; null bila kosong/tidak valid (bukan NaN di
 * UI), dan 0 bila jendela sudah lewat, jadi sesi basi tidak menampilkan angka
 * sisa negatif.
 */
export function remainingMinutes(expiresISO: string | null, nowMs: number): number | null {
  if (!expiresISO) return null;
  const endMs = new Date(expiresISO).getTime();
  if (Number.isNaN(endMs)) return null;
  return Math.max(0, Math.ceil((endMs - nowMs) / 60_000));
}

/**
 * Progres sesi terhadap jendela nyata (started_at → expires_at).
 * null bila `expires_at` kosong/tidak valid, jadi bar tidak menampilkan angka palsu.
 */
export function sessionProgressPct(
  startISO: string,
  expiresISO: string | null,
  nowMs: number
): number | null {
  if (!expiresISO) return null;
  const startMs = new Date(startISO).getTime();
  const endMs = new Date(expiresISO).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) return null;
  const elapsed = nowMs - startMs;
  return Math.min(100, Math.max(0, Math.round((elapsed / (endMs - startMs)) * 100)));
}
