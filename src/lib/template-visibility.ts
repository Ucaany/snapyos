/**
 * Aturan template mana yang tampil di kiosk — docs/05 §5.4.
 * Murni (tanpa server-only) agar bisa diuji unit dan dipakai ulang dashboard.
 *
 * Satu fungsi untuk server (`public-config`, assignment dari DB) DAN klien
 * (`TemplatePicker`, assignment dari `package_ids` di payload) — dua salinan
 * aturan yang sama pernah berbeda hasil, jadi hanya ada satu di sini.
 *
 * Aturan 2026-10-19: frame TIDAK lagi difilter berdasarkan jumlah slot. Semua
 * frame aktif bisa dipakai semua paket; slot yang lebih banyak dari foto diisi
 * bergiliran (`fillSlots` di `template-fit.ts`).
 */

export type VisibilityCandidate = {
  id: string;
  /** Layout jsonb mentah; null/{} = template legacy. Tidak dipakai menyaring. */
  layout?: unknown;
  /** Paket yang meng-assign template ini (payload kiosk). */
  package_ids?: readonly string[];
};

export type VisibilityOptions = {
  /**
   * Template yang di-assign ke paket (null/undefined = tanpa filter assignment).
   * Server membentuknya dari tabel `package_templates`.
   */
  assignedIds?: ReadonlySet<string> | null;
  /**
   * Alternatif untuk klien: saring dari `package_ids` milik kandidat.
   * Diabaikan bila `assignedIds` diberikan.
   */
  packageId?: string | null;
};

/**
 * Assignment package menyempitkan daftar, tapi tidak pernah mengosongkannya:
 * kalau tidak ada template ter-assign sama sekali, jatuh ke seluruh template
 * aktif. Tanpa fallback ini, paket yang belum di-assign menampilkan booth
 * kosong padahal owner melihat templatenya "aktif" di dashboard.
 */
export function selectVisibleTemplates<T extends VisibilityCandidate>(
  candidates: readonly T[],
  options: VisibilityOptions = {}
): T[] {
  const assigned =
    options.assignedIds ??
    (options.packageId
      ? new Set(
          candidates
            .filter((t) => (t.package_ids ?? []).includes(options.packageId!))
            .map((t) => t.id)
        )
      : null);

  if (!assigned) return [...candidates];

  const assignedOk = candidates.filter((t) => assigned.has(t.id));
  return assignedOk.length > 0 ? assignedOk : [...candidates];
}
