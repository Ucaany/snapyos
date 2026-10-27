"use client";

/**
 * Boot offline (Phase 5): keputusan "boleh masuk welcome tanpa cloud?".
 *
 * Hanya kegagalan JARINGAN yang boleh jatuh ke jalur ini. Penolakan
 * otentikasi (`FORBIDDEN`) dan jawaban 4xx/5xx tetap berarti booth harus
 * aktivasi ulang / menampilkan error — bug server tidak boleh disembunyikan
 * di balik booth yang tetap menjual.
 *
 * Slug dari `GET /v1/status` adalah syarat kedua: tanpa itu runtime di port
 * 17777 bisa milik booth lain di jaringan yang sama.
 */

/** Kode KioskError yang berarti "tidak sampai ke server", bukan "ditolak". */
const NETWORK_CODES = new Set(["NETWORK", "TIMEOUT"]);

export function isNetworkFailure(error: unknown): boolean {
  // Baca `code` secara struktural, bukan `instanceof KioskError`: modul ini
  // harus bisa diuji dengan node:test tanpa resolver alias `@/`.
  // Ketat: apiPost sudah membungkus TypeError fetch jadi NETWORK dan abort jadi
  // TIMEOUT. Error lain yang lolos adalah bug, dan bug tidak boleh tampil
  // sebagai booth yang tetap menjual.
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && NETWORK_CODES.has(code);
}

export function canBootOffline(
  error: unknown,
  status: { photobox_slug?: string } | null | undefined,
  photoboxSlug: string
): boolean {
  if (!isNetworkFailure(error)) return false;
  return typeof status?.photobox_slug === "string" && status.photobox_slug === photoboxSlug;
}
