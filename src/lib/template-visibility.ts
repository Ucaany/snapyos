/**
 * Aturan template mana yang tampil di kiosk — docs/05 §5.4.
 * Murni (tanpa server-only) agar bisa diuji unit dan dipakai ulang dashboard.
 *
 * Aturan 2026-10-19: frame TIDAK lagi difilter berdasarkan jumlah slot. Semua
 * frame aktif bisa dipakai semua paket; slot yang lebih banyak dari foto diisi
 * bergiliran (`fillSlots` di `template-fit.ts`). Filter slot lama membuat
 * owner melihat frame "aktif" tetapi booth tidak menampilkannya.
 */

export type VisibilityCandidate = {
  id: string
  /** Layout jsonb mentah; null/{} = template legacy. */
  layout: unknown
}

export type VisibilityOptions = {
  /** Template yang di-assign ke paket (null = tanpa filter assignment). */
  assignedIds: ReadonlySet<string> | null
  /**
   * `packages.photo_count`. Dipertahankan di signature agar pemanggil tidak
   * perlu berubah; tidak lagi menyaring daftar.
   */
  photoCount?: number | null
  /** Jumlah slot template — tidak dipakai untuk menyaring (lihat di atas). */
  slotCountOf?: (layout: unknown) => number
}

/**
 * Assignment package menyempitkan daftar, tapi tidak pernah mengosongkannya:
 * kalau tidak ada template ter-assign sama sekali, jatuh ke seluruh template
 * aktif. Tanpa fallback ini, paket yang belum di-assign menampilkan booth
 * kosong padahal owner melihat templatenya "aktif" di dashboard.
 */
export function selectVisibleTemplates<T extends VisibilityCandidate>(
  candidates: readonly T[],
  { assignedIds }: VisibilityOptions
): T[] {
  if (!assignedIds) return [...candidates]

  const assignedOk = candidates.filter((t) => assignedIds.has(t.id))
  return assignedOk.length > 0 ? assignedOk : [...candidates]
}
