"use client";

/**
 * Satu guard auto-print untuk ketiga renderer (browser, CUPS, thermal).
 *
 * Dua lapis, keduanya wajib:
 *  - `ref` menahan React Strict Mode yang menjalankan effect dua kali pada
 *    instance yang sama (tanpa ref, satu sesi tercetak dua kali).
 *  - sessionStorage menahan remount/refresh setelah job terkirim.
 *
 * Cetak ulang eksplisit (`reprint`) dan retry manual melewati claim storage:
 * customer sudah menekan tombolnya, jadi harus benar-benar mencetak.
 */

import { useCallback, useRef, useState } from "react";

import {
  autoPrintStorageKey,
  claimAutoPrintAttempt,
  getAutoPrintStore,
  shouldClaimAutoPrint,
  type AutoPrintScope,
} from "@/lib/print/auto-print";

export type AutoPrintJobInput = {
  scope: AutoPrintScope;
  /** ID sesi/order stabil; kosong = hanya guard ref per mount. */
  id?: string | null;
  /** true = cetak ulang eksplisit dari customer. */
  reprint?: boolean;
  /** false = tombol manual saja; tidak ada claim sama sekali. */
  auto: boolean;
};

export type AutoPrintJob = {
  /** true = boleh lanjut mencetak. `bypass` untuk retry manual. */
  claim: (bypass?: boolean) => boolean;
  /** true = job ini sudah pernah dicetak otomatis (remount/refresh). */
  blocked: boolean;
  reset: () => void;
};

export function useAutoPrintJob({
  scope,
  id,
  reprint = false,
  auto,
}: AutoPrintJobInput): AutoPrintJob {
  const claimedRef = useRef(false);
  const [blocked, setBlocked] = useState(false);

  const claim = useCallback(
    (bypass = false): boolean => {
      const explicit = bypass || reprint;
      if (!claimedRef.current) {
        claimedRef.current = true;
        if (id && shouldClaimAutoPrint({ auto, reprint: explicit, jobId: id })) {
          if (!claimAutoPrintAttempt(autoPrintStorageKey(scope, id), getAutoPrintStore())) {
            setBlocked(true);
            return false;
          }
        }
        return true;
      }
      return explicit;
    },
    [auto, id, reprint, scope]
  );

  const reset = useCallback(() => setBlocked(false), []);

  return { claim, blocked, reset };
}
