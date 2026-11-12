/**
 * Nama paket hasil duplikat — MURNI (tanpa server-only) agar bisa diuji node.
 * Batas 80 karakter mengikuti `packageCreateSchema.name.max(80)`; tanpa
 * pemotongan, duplikat paket bernama panjang gagal validasi diam-diam.
 */

export const PACKAGE_COPY_SUFFIX = " (salinan)";
export const PACKAGE_NAME_MAX = 80;

export function packageCopyName(name: string): string {
  const base = name.trim().slice(0, PACKAGE_NAME_MAX - PACKAGE_COPY_SUFFIX.length);
  return `${base}${PACKAGE_COPY_SUFFIX}`;
}
