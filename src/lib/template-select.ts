/**
 * Pemilihan template otomatis (kiosk + paket) — MURNI, tanpa DOM/server.
 *
 * Kiosk: default booth menang bila masih eligible; kalau hanya satu template
 * eligible, tidak ada yang perlu dipilih customer.
 * Paket: "assign otomatis" mengutamakan slot == jumlah foto, lalu mode capture.
 */

export type AutoTemplateCandidate = { id: string };

/**
 * Template yang dipilih otomatis kiosk, atau null bila customer harus memilih.
 * `templates` = daftar SETELAH filter paket (eligible).
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

export type AutoAssignCandidate = { id: string; slotCount: number };

/**
 * Id template untuk tombol "Assign otomatis" paket.
 * 1. slot_count == photo_count (kecocokan sempurna),
 * 2. capture_mode cocok (photostrip/burst butuh >1 slot, single 1 slot),
 * 3. jatuh ke slot terdekat supaya tombol tidak pernah no-op.
 */
export function autoAssignTemplateIds(
  candidates: readonly AutoAssignCandidate[],
  input: { photoCount: number; captureMode: string }
): string[] {
  if (candidates.length === 0) return [];
  const photoCount = Number.isFinite(input.photoCount)
    ? Math.max(1, Math.floor(input.photoCount))
    : 1;

  const exact = candidates.filter((c) => c.slotCount === photoCount);
  if (exact.length > 0) return exact.map((c) => c.id);

  const modeMatches = candidates.filter((c) =>
    input.captureMode === "photostrip"
      ? c.slotCount >= Math.max(2, photoCount)
      : input.captureMode === "burst"
        ? c.slotCount >= 2
        : c.slotCount === 1
  );
  if (modeMatches.length > 0) return modeMatches.map((c) => c.id);

  const distance = Math.min(...candidates.map((c) => Math.abs(c.slotCount - photoCount)));
  return candidates.filter((c) => Math.abs(c.slotCount - photoCount) === distance).map((c) => c.id);
}
