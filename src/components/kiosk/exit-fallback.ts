"use client";

/**
 * Jalur PIN keluar (Phase 6): cloud dulu, PIN darurat lokal hanya saat jaringan mati.
 *
 * Urutannya bukan preferensi gaya. PIN utama beserta rate-limit-nya
 * (`exit_pin_failed_count` / `exit_pin_locked_until`) tinggal di cloud; kalau
 * `PIN_LOCKED` boleh jatuh ke PIN darurat, penyerang cukup memutus kabel untuk
 * membatalkan kunci itu. Karena itu hanya `NETWORK`/`TIMEOUT` yang fallback —
 * kode yang sama dipakai boot offline (`boot-offline.ts`).
 *
 * Modul ini sengaja tanpa import `@/`: logikanya harus bisa diuji langsung.
 */

import { isNetworkFailure } from "./boot-offline.ts";
import { KioskError } from "./api.ts";

export type ExitResult = { ok: boolean; pin_required?: boolean; emergency?: boolean };

/**
 * Verifikasi PIN: cloud selalu dicoba dulu. Error non-jaringan (4xx/5xx,
 * `PIN_LOCKED`, `FORBIDDEN`) diteruskan apa adanya — bug server tidak boleh
 * tersembunyi di balik booth yang tetap bisa dibuka.
 */
export async function submitExit(input: {
  cloud: () => Promise<ExitResult>;
  local: () => Promise<ExitResult>;
  onSuccess: () => void;
  onError: (message: string) => void;
}): Promise<void> {
  try {
    await input.cloud();
  } catch (error) {
    if (!isNetworkFailure(error)) {
      input.onError(messageOf(error));
      return;
    }
    try {
      await input.local();
    } catch (localError) {
      input.onError(messageOf(localError));
      return;
    }
  }
  input.onSuccess();
}

function messageOf(error: unknown): string {
  return error instanceof KioskError && error.message
    ? error.message
    : "Gagal memverifikasi PIN. Coba lagi.";
}
