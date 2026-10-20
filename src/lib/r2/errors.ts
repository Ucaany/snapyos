/**
 * Klasifikasi error R2/S3 (PURE, tanpa `server-only`) — dipakai provider
 * storage agar `head()` dan jalur `upsert:false` memakai SATU definisi
 * "objek tidak ada". Kalau definisi ini terduplikasi, kedua jalur bisa
 * berbeda pendapat dan `upsert:false` berubah jadi overwrite diam-diam.
 */

/**
 * True HANYA bila error berarti objek benar-benar tidak ada (404/NotFound/
 * NoSuchKey). Error lain (403, 5xx, timeout, misconfig bucket) = status tak
 * diketahui, bukan "tidak ada" — caller harus memperlakukannya sebagai gagal.
 */
export function isObjectNotFoundError(error: unknown): boolean {
  const status = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
  const code = (error as { name?: string; Code?: string })?.name;
  const nestedCode = (error as { Code?: string })?.Code;
  return (
    status === 404 ||
    code === "NotFound" ||
    code === "NoSuchKey" ||
    nestedCode === "NotFound" ||
    nestedCode === "NoSuchKey"
  );
}
