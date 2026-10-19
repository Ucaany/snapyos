/**
 * Pengisian slot frame oleh foto, PURE (tanpa DOM) agar bisa diuji langsung.
 *
 * Aturan produk (2026-10-19): frame tidak lagi dikunci ke paket dengan jumlah
 * foto yang sama. Semua frame aktif bisa dipakai semua paket; jumlah capture
 * tetap `packages.photo_count`. Slot yang lebih banyak dari foto diisi
 * bergiliran (foto ke-1, ke-2, ..., lalu kembali ke foto ke-1).
 */

/**
 * Indeks foto untuk tiap slot, urut slot z naik.
 *
 * @param slotCount jumlah slot template (0 = template legacy, tanpa slot)
 * @param photoCount jumlah foto yang tersedia
 * @returns array sepanjang `slotCount`; kosong bila salah satu input <= 0
 */
export function fillSlots(slotCount: number, photoCount: number): number[] {
  const slots = Math.max(0, Math.floor(slotCount));
  const photos = Math.max(0, Math.floor(photoCount));
  if (slots === 0 || photos === 0) return [];
  return Array.from({ length: slots }, (_, i) => i % photos);
}

/**
 * Apakah komposisi memakai foto berulang? Dipakai UI untuk memberi tahu
 * customer/owner secara jujur bahwa sebagian foto muncul lebih dari sekali.
 */
export function hasRepeatedSlots(slotCount: number, photoCount: number): boolean {
  return slotCount > photoCount && photoCount > 0;
}
