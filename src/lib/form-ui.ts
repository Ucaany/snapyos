import type { FormState } from "@/server/auth-actions";

/**
 * Konstanta & helper UI form dashboard.
 * Boleh diimpor dari client component ("use client") — hanya berisi
 * fungsi murni + string, tidak menyentuh server-only API.
 * `import type { FormState }` di-strip di runtime.
 */

/** Kelas label mono uppercase — dipakai di semua field-set dashboard. */
export const LABEL_CLASS = "font-mono text-xs uppercase tracking-[0.1em]";

/** Ambil pesan error pertama untuk field tertentu dari FormState. */
export function fieldError(state: FormState, key: string): string | undefined {
  return state.fieldErrors?.[key]?.[0];
}

/** Semua pesan error untuk satu field (validasi per-field bisa >1 aturan). */
export function fieldErrors(state: FormState, key: string): string[] {
  return state.fieldErrors?.[key] ?? [];
}

/**
 * Lantai harga IDR untuk SEMUA input harga (paket & produk POS).
 * Satu angka: server (`idrPrice` di validators.ts) memakai nilai yang sama,
 * supaya atribut `min` di form tidak pernah lebih longgar dari validasi.
 */
export const IDR_PRICE_FLOOR = 1000;
