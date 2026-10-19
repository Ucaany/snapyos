/**
 * Batas resize proxy frame, PURE (tanpa server-only) agar bisa diuji langsung.
 * Dipakai `src/app/api/v1/public/frame/route.ts` untuk parameter `?w=`.
 */

export const FRAME_RESIZE_MIN = 64;
export const FRAME_RESIZE_MAX = 1024;

/** Nilai `?w=` yang sah, dibulatkan dan dijepit ke 64–1024. Null = tanpa resize. */
export function clampResizeWidth(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  return Math.min(FRAME_RESIZE_MAX, Math.max(FRAME_RESIZE_MIN, Math.round(value)));
}
