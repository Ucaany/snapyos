/**
 * Atribusi kegagalan `remove` batch per key — PURE (tanpa `server-only`).
 *
 * Provider S3-compatible (R2 `DeleteObjects`) membalas HTTP 200 walau sebagian
 * objek gagal; kegagalan hanya terlihat di `Errors[]`. Provider yang tidak
 * melaporkan key spesifik (`error.keys` kosong) berarti SELURUH batch gagal —
 * menandai sebagian "sukses" tanpa bukti akan membuat ledger mengira objek
 * terhapus padahal masih menagih storage.
 */

export type RemoveOutcome = {
  ok: string[];
  failures: { key: string; message: string }[];
};

export function splitRemoveOutcome(
  keys: string[],
  error: { message: string; keys?: string[] } | null
): RemoveOutcome {
  if (!error) return { ok: [...keys], failures: [] };
  const failed = new Set(error.keys ?? []);
  if (failed.size === 0) {
    return { ok: [], failures: keys.map((key) => ({ key, message: error.message })) };
  }
  const ok: string[] = [];
  const failures: { key: string; message: string }[] = [];
  for (const key of keys) {
    if (failed.has(key)) failures.push({ key, message: error.message });
    else ok.push(key);
  }
  return { ok, failures };
}
