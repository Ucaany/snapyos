"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, Printer, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PrintPlan, PrintSettingsInput } from "@/lib/print-layout";
import {
  printCopies,
  printPageSize,
  printSheets,
  shouldAutoPrint,
} from "@/lib/print-layout";
import {
  autoPrintStorageKey,
  claimAutoPrintAttempt,
  getAutoPrintStore,
  shouldClaimAutoPrint,
} from "@/lib/print/auto-print";
import { submitCupsPrint } from "@/lib/print/cups";

type Props = {
  photos: { blob: Blob }[];
  plan: PrintPlan;
  printSettings?: PrintSettingsInput | null;
  jobId?: string;
  reprint?: boolean;
  onDone: (success: boolean) => void;
};

type State = "loading" | "ready" | "printing" | "done" | "error";

export function CupsPrintScreen({
  photos,
  plan,
  printSettings,
  jobId,
  reprint = false,
  onDone,
}: Props) {
  const [state, setState] = useState<State>("loading");
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const doneRef = useRef(false);
  const claimedRef = useRef(false);
  const manualRetryRef = useRef(false);
  const printingRef = useRef(false);
  const auto = shouldAutoPrint(printSettings);
  const copies = printCopies(printSettings);
  const page = printPageSize(printSettings);
  const sheetIndexes = useMemo(() => printSheets(plan, photos.length, copies), [copies, photos.length, plan]);
  const totalSheets = sheetIndexes.length;

  const finish = useCallback(
    (success: boolean) => {
      if (doneRef.current) return;
      doneRef.current = true;
      setState(success ? "done" : "error");
      if (success) window.setTimeout(() => onDone(true), 300);
    },
    [onDone]
  );

  const print = useCallback(async () => {
    if (printingRef.current || doneRef.current) return;
    printingRef.current = true;
    setState("printing");
    setError(null);
    try {
      if (sheetIndexes.length === 0) throw new Error("Tidak ada foto untuk dicetak.");
      const sheets = sheetIndexes.map((indexes) =>
        indexes.map((index) => photos[index]?.blob).filter((blob): blob is Blob => Boolean(blob))
      );
      await submitCupsPrint(printSettings, sheets);
      finish(true);
    } catch (cause) {
      printingRef.current = false;
      setError(cause instanceof Error ? cause.message : "CUPS gagal mencetak.");
      setState("error");
    }
  }, [finish, photos, printSettings, sheetIndexes]);

  useEffect(() => {
    if (plan.kind === "digital") {
      finish(false);
      return;
    }
    let cancelled = false;
    const prepare = async () => {
      await Promise.resolve();
      if (cancelled) return;
      setState("ready");
      if (!auto) return;
      const bypassClaim = reprint || manualRetryRef.current;
      manualRetryRef.current = false;
      if (!claimedRef.current) {
        if (jobId && shouldClaimAutoPrint({ auto, reprint: bypassClaim, jobId })) {
          if (!claimAutoPrintAttempt(autoPrintStorageKey("kiosk", jobId), getAutoPrintStore())) {
            setError("Cetak otomatis untuk sesi ini sudah pernah dikirim.");
            setState("error");
            return;
          }
        }
        claimedRef.current = true;
        void print();
      } else if (bypassClaim) {
        void print();
      }
    };
    void prepare();
    return () => {
      cancelled = true;
      printingRef.current = false;
    };
  }, [auto, finish, jobId, plan.kind, print, reprint, retryKey]);

  const retry = () => {
    doneRef.current = false;
    printingRef.current = false;
    manualRetryRef.current = true;
    setError(null);
    setState("loading");
    setRetryKey((value) => value + 1);
  };

  const skip = () => {
    if (state === "printing" || doneRef.current) return;
    doneRef.current = true;
    onDone(false);
  };

  if (plan.kind === "digital") return null;

  return (
    <>
      <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-5 overflow-y-auto bg-bg p-6 text-center md:p-8">
        {state === "error" ? (
          <>
            <TriangleAlert className="size-10 text-destructive" aria-hidden />
            <p className="font-display text-xl uppercase leading-none tracking-[-0.02em] md:text-2xl">
              CUPS gagal mencetak
            </p>
            <p className="max-w-[48ch] text-sm leading-relaxed text-muted-foreground">
              {error || "Periksa bridge lokal, CUPS, kertas, dan nama printer."}
            </p>
            <div className="flex flex-wrap justify-center gap-2.5">
              <Button size="lg" variant="outline" onClick={retry}>Coba lagi</Button>
              <Button size="lg" onClick={skip}>Lanjut tanpa cetak</Button>
            </div>
          </>
        ) : state === "done" ? (
          <>
            <Check className="size-10 text-accent-3" aria-hidden />
            <p className="font-display text-xl uppercase leading-none tracking-[-0.02em] md:text-2xl">
              Perintah cetak terkirim
            </p>
            <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {`${totalSheets} LEMBAR · ${page.widthMm} × ${page.heightMm} MM`}
            </p>
          </>
        ) : state === "ready" ? (
          <>
            <Printer className="size-10" aria-hidden />
            <p className="font-display text-xl uppercase leading-none tracking-[-0.02em] md:text-2xl">
              Siap dicetak
            </p>
            <p className="max-w-[48ch] text-sm leading-relaxed text-muted-foreground">
              {`${totalSheets} lembar · CUPS lokal · ${page.widthMm} × ${page.heightMm} mm · margin ${page.marginMm} mm`}
            </p>
            <div className="flex flex-wrap justify-center gap-2.5">
              {!auto && <Button size="lg" onClick={() => void print()}><Printer className="size-5" aria-hidden /> Cetak</Button>}
              <Button size="lg" variant="outline" onClick={skip}>Lanjut</Button>
            </div>
          </>
        ) : (
          <>
            <Loader2 className="size-10 animate-spin" aria-hidden />
            <p className="font-display text-xl uppercase leading-none tracking-[-0.02em] md:text-2xl">
              {state === "loading" ? "Menyiapkan cetak" : "Mengirim ke CUPS"}
            </p>
            <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {`${totalSheets} LEMBAR`}
            </p>
          </>
        )}
      </div>
    </>
  );
}
