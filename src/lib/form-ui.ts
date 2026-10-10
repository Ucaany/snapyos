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
