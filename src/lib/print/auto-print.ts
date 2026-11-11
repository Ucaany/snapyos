/**
 * Guard auto-print per job — mencegah cetak ganda akibat Strict Mode,
 * refresh, atau remount komponen.
 *
 * Claim disimpan di sessionStorage SEBELUM job dikirim. Artinya reload setelah
 * job terkirim tidak akan mencetak ulang otomatis; tombol cetak manual tetap
 * tersedia. Bila storage diblokir (mode privat), pemanggil tetap memakai ref
 * lokal sebagai guard sekali-per-mount.
 */

export type AutoPrintStore = Pick<Storage, "getItem" | "setItem">;

export type AutoPrintScope = "kiosk" | "pos";

export function autoPrintStorageKey(scope: AutoPrintScope, id: string): string {
  return `snapyos:${scope}:autoprint:${id}`;
}

/**
 * Apakah percobaan ini boleh memakai claim storage?
 *
 * Reprint eksplisit tidak boleh diblokir oleh claim auto-print sebelumnya —
 * customer sudah menekan "Cetak ulang" dan mengharapkan kertas keluar lagi.
 */
export function shouldClaimAutoPrint(input: {
  auto: boolean;
  reprint: boolean;
  jobId?: string | null;
}): boolean {
  return input.auto && !input.reprint && Boolean(input.jobId);
}

/** true = pemanggil pertama untuk job ini; false = sudah pernah dicoba. */
export function claimAutoPrintAttempt(key: string, store: AutoPrintStore | null): boolean {
  if (!store) return true;
  try {
    if (store.getItem(key)) return false;
    store.setItem(key, "1");
    return true;
  } catch {
    return true;
  }
}

/** sessionStorage aman diakses; null saat SSR atau storage diblokir. */
export function getAutoPrintStore(): AutoPrintStore | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}
