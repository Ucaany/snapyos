/**
 * Logical storage areas — peta area logis → bucket R2 terpisah.
 *
 * Keputusan (revisi dari Phase 1 single-bucket): DUA bucket privat terpisah,
 * satu per area:
 *   business-assets   → bucket R2_BUCKET_BUSINESS_ASSETS
 *   generated-photos  → bucket R2_BUCKET_GENERATED_PHOTOS
 * Alasan: isolasi lifecycle/retensi berbeda (generated-photos = retensi 3 hari,
 * business-assets = aset jangka panjang) dan permission terpisah tanpa prefix
 * yang mudah salah saat sweep/delete. Key DB existing dipakai APA ADANYA
 * (tanpa prefix area) karena nama bucket sudah meng-encode area.
 *
 * Struktur object key (identik Supabase per bucket):
 *   <bucket business-assets>/<businessId>/branding/...
 *   <bucket business-assets>/<businessId>/templates/...
 *   <bucket business-assets>/global/templates/...            (template global admin)
 *   <bucket generated-photos>/<businessId>/sessions/<sessionId>/photo-NN.jpg
 *   <bucket generated-photos>/<businessId>/sessions/<sessionId>/result.gif
 *
 * `public-assets` (Supabase) TIDAK dipetakan — bucket itu menganggur di
 * codebase (audit) dan tetap tanpa padanan di R2 sampai ada kebutuhan.
 */

/** Area logis yang dipetakan ke R2 (subset dari bucket Supabase aktif). */
export const R2_AREAS = ["business-assets", "generated-photos"] as const;

export type R2Area = (typeof R2_AREAS)[number];

/** Env var nama bucket R2 per area. */
export const R2_BUCKET_ENV: Record<R2Area, string> = {
  "business-assets": "R2_BUCKET_BUSINESS_ASSETS",
  "generated-photos": "R2_BUCKET_GENERATED_PHOTOS",
};

/**
 * Legacy `R2_BUCKET` (single-bucket) — dipakai sebagai fallback nama bucket
 * area manapun bila `R2_BUCKET_<AREA>` tidak di-set (kompatibilitas deploy lama).
 */
export const R2_BUCKET_ENV_LEGACY = "R2_BUCKET";

/**
 * Nama bucket R2 untuk area, dari env. Preferensi:
 *   1. `R2_BUCKET_<AREA>` (per-area, dipakai produksi).
 *   2. `R2_BUCKET` legacy (satu bucket untuk semua area).
 */
export function r2BucketName(
  area: R2Area,
  env: Record<string, string | undefined>
): string {
  const perArea = env[R2_BUCKET_ENV[area]]?.trim();
  if (perArea) return perArea;
  return env[R2_BUCKET_ENV_LEGACY]?.trim() ?? "";
}

/**
 * Bangun object key R2 dari area + key existing. Key dipakai apa adanya.
 * Guard path-traversal: tolak segmen `..` dan backslash agar key tak bisa
 * keluar dari prefix/bucket (defense-in-depth; pemanggil tetap wajib allowlist
 * id yang masuk ke key, mis. `KIOSK_PAGE_IDS`).
 */
export function r2Key(_area: R2Area, key: string): string {
  const normalized = key.replace(/^\/+/, "");
  if (normalized.split("/").includes("..") || normalized.includes("\\")) {
    throw new Error("R2 key tidak valid: path traversal terdeteksi");
  }
  return normalized;
}
