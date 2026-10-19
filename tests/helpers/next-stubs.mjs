/**
 * Stub modul Next/Auth.js untuk tes unit.
 *
 * Modul-modul ini hanya berfungsi di dalam runtime Next (request context).
 * Di `node --test` tidak ada request, jadi tes menyuntik nilai lewat global:
 *   globalThis.__COOKIES_STUB = { get: (n) => ({ value: "..." }) }
 *   globalThis.__AUTH_STUB    = async () => ({ user: { id: "..." } })
 */

/** `next/headers` → cookies() mengembalikan stub yang diatur tes. */
export function cookies() {
  const stub = globalThis.__COOKIES_STUB;
  if (!stub) {
    throw new Error("cookies() dipanggil tanpa stub — set globalThis.__COOKIES_STUB.");
  }
  return stub;
}

/** `next/headers` → headers() jarang dipakai di modul yang diuji. */
export function headers() {
  const stub = globalThis.__HEADERS_STUB;
  if (!stub) {
    throw new Error("headers() dipanggil tanpa stub — set globalThis.__HEADERS_STUB.");
  }
  return stub;
}

/** `@/lib/auth` → auth() mengembalikan sesi yang diatur tes. */
export async function auth() {
  const stub = globalThis.__AUTH_STUB;
  if (!stub) {
    throw new Error("auth() dipanggil tanpa stub — set globalThis.__AUTH_STUB.");
  }
  return typeof stub === "function" ? stub() : stub;
}

/** `@/lib/auth` → signOut tidak relevan untuk tes murni. */
export async function signOut() {
  throw new Error("signOut tidak tersedia di tes.");
}
