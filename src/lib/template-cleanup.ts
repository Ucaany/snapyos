/**
 * Aturan key storage basi untuk template — PURE (tanpa `server-only`) agar
 * dapat diuji via node:test. Dipakai dua jalur:
 * - deteksi area hijau: buang frame lama + thumbnail lama (file asli disimpan).
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

/**
 * Key thumbnail lama yang aman dihapus saat thumbnail diganti.
 * Pengecualian WAJIB: `currentFrame` — pada template hasil upload, thumbnail
 * default = frame (file_url) sama; menghapusnya akan menghilangkan frame.
 * Juga mengecualikan thumbnail baru (`newThumbnail`).
 */
export function staleThumbnailKeys(input: {
  oldThumbnail?: string | null;
  newThumbnail: string;
  /** file_url template — masih dipakai sebagai frame, jangan dihapus. */
  currentFrame?: string | null;
}): string[] {
  return staleTemplateKeys({
    oldThumbnail: input.oldThumbnail,
    newKey: input.newThumbnail,
  }).filter((k) => k !== input.currentFrame);
}

/**
 * Saring key storage: buang URL absolut (CDN publik) yang bukan objek bucket.
 * Frame global boleh diisi URL eksternal — jangan di-probe/hapus sebagai key.
 */
export function storageKeysOnly(keys: string[]): string[] {
  return keys.filter((k) => !/^https?:\/\//i.test(k));
}
