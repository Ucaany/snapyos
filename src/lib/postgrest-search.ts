/**
 * Helper pencarian teks untuk PostgREST, dipakai dashboard owner
 * (transaksi + pelanggan).
 *
 * Nilai user masuk ke ekspresi `.or("name.ilike.%q%,phone.ilike.%q%")`.
 * PostgREST mem-parse string itu sebagai logika filter, sehingga karakter
 * `,` `(` `)` di dalam nilai MERUSAK ekspresi:
 *   - `,` → 400 PGRST100 (filter gagal di-parse → halaman error),
 *   - `(` `)` → filter valid tapi hasilnya salah (nol baris).
 * `%` dan `_` adalah wildcard LIKE, jadi harus di-escape agar dicari literal.
 *
 * Sanitizer: buang `,` `(` `)` (tidak mungkin jadi bagian nama/telepon),
 * escape `%` `_` `\` untuk LIKE.
 */
export function likePattern(raw: string): string {
  const cleaned = raw.replace(/[,()]/g, "");
  const escaped = cleaned.replace(/[\\%_]/g, (m) => `\\${m}`);
  return `%${escaped}%`;
}
