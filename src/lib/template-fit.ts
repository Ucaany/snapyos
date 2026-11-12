/**
 * Pengisian slot frame oleh foto, PURE (tanpa DOM) agar bisa diuji langsung.
 *
 * Aturan produk (2026-10-19): frame tidak lagi dikunci ke paket dengan jumlah
 * foto yang sama. Semua frame aktif bisa dipakai semua paket; frame ber-slot
 * menentukan jumlah capture, sedangkan `packages.photo_count` hanya fallback
 * untuk template legacy tanpa slot. Slot yang lebih banyak dari foto tersedia
 * diisi bergiliran (foto ke-1, ke-2, ..., lalu kembali ke foto ke-1).
 */

/**
 * Indeks foto untuk tiap slot, urut slot z naik.
 *
 * @param slotCount jumlah slot template (0 = template legacy, tanpa slot)
 * @param photoCount jumlah foto yang tersedia
 * @returns array sepanjang `slotCount`; kosong bila salah satu input <= 0
 */
export function fillSlots(slotCount: number, photoCount: number): number[] {
  const slots = Number.isFinite(slotCount) ? Math.max(0, Math.floor(slotCount)) : 0;
  const photos = Number.isFinite(photoCount) ? Math.max(0, Math.floor(photoCount)) : 0;
  if (slots === 0 || photos === 0) return [];
  return Array.from({ length: slots }, (_, i) => i % photos);
}

/** Jumlah capture yang benar-benar dipakai setelah frame dipilih. */
export function resolveCaptureCount(packagePhotoCount: number, templateSlotCount: number): number {
  const slots = Number.isFinite(templateSlotCount) ? Math.max(0, Math.floor(templateSlotCount)) : 0;
  if (slots > 0) return slots;
  const photos = Number.isFinite(packagePhotoCount) ? Math.floor(packagePhotoCount) : 1;
  return Math.max(1, photos);
}
