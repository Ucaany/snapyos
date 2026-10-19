/**
 * Deklarasi global untuk stub tes (`tests/helpers/*`).
 *
 * Loader uji mengalihkan modul Next/Supabase ke stub yang membaca global ini,
 * sehingga tes bisa menyuntik nilai tanpa request context Next.
 */

type CookieStoreStub = {
  get: (name: string) => { value: string } | undefined;
};

declare global {
  /** `createServerClient()` → klien palsu (lihat helpers/supabase-mock.mjs). */
  var __SB_STUB: (() => unknown) | undefined;
  /** `cookies()` dari `next/headers`. */
  var __COOKIES_STUB: CookieStoreStub | undefined;
  /** `headers()` dari `next/headers`. */
  var __HEADERS_STUB: unknown;
  /** `auth()` dari `@/lib/auth`. */
  var __AUTH_STUB: unknown;
}

export {};
