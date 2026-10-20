/**
 * Satuan storage — satu sumber konversi byte ↔ MB untuk seluruh aplikasi.
 *
 * Produk memakai label **MB** (bukan GB). Nilai di database tetap bytes untuk
 * pemakaian dan MB integer untuk kuota plan/add-on. Konversi biner dipakai
 * secara eksplisit (1 MB = 1.048.576 bytes) agar batas upload dan tampilan
 * tidak pernah memakai dua definisi yang berbeda.
 */

export const BYTES_PER_MB = 1024 * 1024;

/** MB integer → bytes; nilai pecahan/negatif dinormalisasi ke 0. */
export function mbToBytes(mb: number): number {
  if (!Number.isFinite(mb) || mb <= 0) return 0;
  return Math.floor(mb) * BYTES_PER_MB;
}

/** Bytes → MB dibulatkan ke atas (pemakaian sebagian MB tetap terhitung). */
export function bytesToMb(bytes: number): number {
  if (!Number.isFinite(bytes) || bytes <= 0) return 0;
  return Math.ceil(bytes / BYTES_PER_MB);
}

/** Format angka MB untuk UI; selalu berakhiran " MB", tidak pernah " GB". */
export function formatStorageMb(mb: number): string {
  const safe = Number.isFinite(mb) && mb > 0 ? Math.ceil(mb) : 0;
  return `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(safe)} MB`;
}

/**
 * Nama add-on storage yang tersimpan di DB mungkin masih memakai label lama
 * ("1 GB") dari seed 0053. UI dan intent/invoice baru memakai MB; baris lama
 * dinormalisasi saat dibaca agar kontrak MB berlaku sebelum migrasi 0072
 * dijalankan. Nama non-storage tidak diubah.
 */
export function storageAddOnDisplayName(input: {
  name: string;
  unit: string;
  storageMb?: number | null;
}): string {
  if (input.unit !== "storage" || typeof input.storageMb !== "number" || input.storageMb <= 0) {
    return input.name;
  }
  if (!/\bGB\b/i.test(input.name)) return input.name;
  return `Tambah Storage ${formatStorageMb(input.storageMb)}`;
}

/**
 * Total MB add-on storage aktif: `storage_mb × quantity` per baris.
 *
 * `storage_mb` null/0 = add-on non-storage (sesi, POS) → diabaikan. Quantity
 * pecahan/negatif dinormalisasi ke 0 supaya kuota tidak pernah negatif.
 */
export function sumStorageAddOnMb(
  rows: Iterable<{
    quantity?: number | null;
    addOn?: { storage_mb?: number | null } | null;
  }>
): number {
  let total = 0;
  for (const row of rows) {
    const mb = row.addOn?.storage_mb;
    if (typeof mb !== "number" || !Number.isFinite(mb) || mb <= 0) continue;
    const quantity =
      typeof row.quantity === "number" && Number.isFinite(row.quantity)
        ? Math.max(0, Math.floor(row.quantity))
        : 0;
    total += mb * quantity;
  }
  return total;
}
