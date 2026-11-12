/**
 * Pemilihan template otomatis kiosk — MURNI, tanpa DOM/server.
 *
 * Kiosk: default booth menang bila masih eligible; kalau hanya satu template
 * eligible, tidak ada yang perlu dipilih customer.
 *
 * `autoAssignTemplateIds` (tombol "Assign otomatis" paket) dihapus 2026-11-11:
 * assignment template ke paket tidak lagi ada, jadi tidak ada yang perlu diisi.
 */

export type AutoTemplateCandidate = { id: string };

/**
 * Template yang dipilih otomatis kiosk, atau null bila customer harus memilih.
 * `templates` = seluruh template aktif yang tampil di kiosk.
 */
export function selectAutoTemplate<T extends AutoTemplateCandidate>(
  templates: readonly T[],
  defaultTemplateId?: string | null
): T | null {
  if (templates.length === 0) return null;
  if (defaultTemplateId) {
    const hit = templates.find((t) => t.id === defaultTemplateId);
    if (hit) return hit;
  }
  return templates.length === 1 ? (templates[0] ?? null) : null;
}
