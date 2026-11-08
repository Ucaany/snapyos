/**
 * Aturan assignment template — MURNI (tanpa "server-only", tanpa I/O).
 * Dipakai server (packages.ts) dan kiosk/builder agar satu sumber kebenaran.
 */

export type AssignableTemplateRow = {
  id: string;
  business_id: string | null;
  is_active: boolean;
  is_premium: boolean;
  price: number | null;
};

/** Global gratis: bukan premium, tanpa harga, atau harga 0. */
export function isFreeTemplate(row: Pick<AssignableTemplateRow, "is_premium" | "price">): boolean {
  return !row.is_premium || row.price == null || row.price === 0;
}

export function isTemplateAssignable(
  row: AssignableTemplateRow,
  businessId: string,
  purchasedIds: ReadonlySet<string>
): boolean {
  // Milik business sendiri → selalu boleh.
  if (row.business_id === businessId) return true;
  // Business lain → tidak pernah boleh.
  if (row.business_id !== null) return false;
  // Global: wajib aktif DAN (gratis ATAU sudah dibeli).
  return row.is_active && (isFreeTemplate(row) || purchasedIds.has(row.id));
}

/** Id yang tidak ada di `rows` ATAU tidak assignable untuk business ini. */
export function invalidTemplateIds(
  rows: readonly AssignableTemplateRow[],
  businessId: string,
  purchasedIds: ReadonlySet<string>,
  ids: readonly string[]
): string[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.filter((id) => {
    const row = byId.get(id);
    return !row || !isTemplateAssignable(row, businessId, purchasedIds);
  });
}
