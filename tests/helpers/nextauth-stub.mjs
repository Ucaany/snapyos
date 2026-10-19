/**
 * Stub `next-auth` untuk tes unit.
 *
 * Modul aslinya menarik `next/server` (tanpa ekstensi) yang tidak bisa
 * di-resolve Node di luar runtime Next. Tes revocation hanya butuh fungsi murni
 * `resolveTokenAfterRevocationCheck`; `NextAuth(...)` di `src/lib/auth.ts`
 * dievaluasi saat impor, jadi cukup mengembalikan objek berbentuk sama tanpa
 * efek samping.
 */

/** `NextAuth(config)` → `{ handlers, auth, signIn, signOut }`. */
export default function NextAuth() {
  return {
    handlers: { GET: () => {}, POST: () => {} },
    auth: async () => null,
    signIn: async () => {},
    signOut: async () => {},
  };
}
