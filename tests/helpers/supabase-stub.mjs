/**
 * Stub `@/lib/supabase/server` untuk tes.
 *
 * Modul ini dievaluasi di thread utama, jadi bisa membaca `globalThis.__SB_STUB`
 * yang diatur berkas tes sebelum impor. Tanpa stub → melempar, supaya tes yang
 * lupa menyiapkan tidak diam-diam lolos.
 */

export function createServerClient() {
  const factory = globalThis.__SB_STUB;
  if (typeof factory !== "function") {
    throw new Error(
      "createServerClient dipanggil tanpa stub — set globalThis.__SB_STUB di tes."
    );
  }
  return factory();
}
