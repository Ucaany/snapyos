/**
 * Aturan key storage basi untuk template — PURE (tanpa `server-only`) agar
 * dapat diuji via node:test. Dipakai dua jalur:
 * - replace frame (chroma-key): buang frame lama + thumbnail lama.
 * - hapus template: buang frame + thumbnail.
 *
 * Semua key di-dedup dan key baru (`newKey`, bila ada) dikecualikan supaya
 * objek yang masih direferensikan tidak pernah ikut terhapus.
 */

export type StaleTemplateInput = {
  oldFile?: string | null;
  oldThumbnail?: string | null;
  /** Key baru yang tetap dipakai — dikecualikan dari hasil. */
  newKey?: string | null;
};

export function staleTemplateKeys(input: StaleTemplateInput): string[] {
  const candidate = [input.oldFile, input.oldThumbnail];
  const filtered = candidate.filter(
    (k): k is string => typeof k === "string" && k.length > 0 && k !== input.newKey
  );
  return Array.from(new Set(filtered));
}
