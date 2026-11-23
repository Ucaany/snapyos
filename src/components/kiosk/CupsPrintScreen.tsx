"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, Printer, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PrintPlan, PrintSettingsInput } from "@/lib/print-layout";
import {
  printCopies,
  printPageSize,
  printSheets,
  resolvePrintFit,
  shouldAutoPrint,
} from "@/lib/print-layout";
import { useAutoPrintJob } from "@/hooks/use-auto-print-job";
import {
  confirmCupsJob,
  enableCupsPrinter,
  fetchPrintJob,
  fetchPrinterStatus,
  retryCupsJob,
  submitCupsPrint,
  type CupsJobSnapshot,
} from "@/lib/print/cups";

type Props = {
  photos: { blob: Blob }[];
  plan: PrintPlan;
  printSettings?: PrintSettingsInput | null;
  jobId?: string;
  /** true = lembar berframe/composite (fit auto → contain). */
  framed?: boolean;
  /** Rasio kanvas untuk orientation=auto. */
  canvasAspect?: number | null;
  reprint?: boolean;
  qrPending?: boolean;
  onDone: (success: boolean) => void;
};

type State = "loading" | "ready" | "printing" | "done" | "error";

export function CupsPrintScreen({
  photos,
  plan,
  printSettings,
  jobId,
  framed = false,
  canvasAspect = null,
  reprint = false,
  qrPending = false,
  onDone,
}: Props) {
  const [state, setState] = useState<State>("loading");
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const doneRef = useRef(false);
  const manualRetryRef = useRef(false);
  // Operator sudah menekan "Kertas keluar" — cegah onDone ganda.
  const confirmedRef = useRef(false);
  const printingRef = useRef(false);
  const [confirming, setConfirming] = useState(false);
  // Job antrean runtime — retry memakai endpoint, bukan kirim ulang buta.
  const serverJobRef = useRef<string | null>(null);
  const [pollJobId, setPollJobId] = useState<string | null>(null);
  const [jobState, setJobState] = useState<CupsJobSnapshot["status"] | null>(null);
  const auto = shouldAutoPrint(printSettings);
  // Destructure: objek hook dibuat ulang tiap render, `claim` stabil via useCallback.
  const { claim: claimAutoPrint } = useAutoPrintJob({
    scope: "kiosk",
    id: jobId,
    reprint,
    auto,
  });
  const copies = printCopies(printSettings);
  const page = printPageSize(printSettings, canvasAspect);
  const strip = plan.kind === "strip";
  const fit = resolvePrintFit(printSettings?.fit, { framed, strip });
  const sheetIndexes = useMemo(
    () => printSheets(plan, photos.length, copies),
    [copies, photos.length, plan]
  );
  const totalSheets = sheetIndexes.length;

  // Sukses TIDAK langsung menutup layar: operator wajib mengonfirmasi
  // "Kertas keluar" (`confirmCupsJob`), karena spooler bukan bukti fisik.
  const finish = useCallback((success: boolean) => {
    if (doneRef.current) return;
    doneRef.current = true;
    setState(success ? "done" : "error");
  }, []);

  const print = useCallback(async () => {
    if (printingRef.current || doneRef.current) return;
    printingRef.current = true;
    setState("printing");
    setError(null);
    try {
      if (sheetIndexes.length === 0) throw new Error("Tidak ada foto untuk dicetak.");

      // Retry eksplisit setelah job tercatat: pakai endpoint antrean.
      if (manualRetryRef.current && serverJobRef.current) {
        manualRetryRef.current = false;
        const retried = await retryCupsJob(printSettings, serverJobRef.current);
        if (retried.status === "failed") {
          printingRef.current = false;
          setError(retried.error || "CUPS gagal mencetak ulang.");
          setState("error");
          return;
        }
        finish(true);
        return;
      }

      const sheets = sheetIndexes.map((indexes) =>
        indexes.map((index) => photos[index]?.blob).filter((blob): blob is Blob => Boolean(blob))
      );
      // Preflight: jangan kirim job yang pasti gagal. `offline` (kabel/paper-out)
      // tidak di-enable otomatis; `disabled` boleh dibuka sekali.
      const status = await fetchPrinterStatus(printSettings, printSettings?.printer_name ?? undefined);
      if (status?.state === "offline") {
        throw new Error(
          `Printer ${status.printer || "default"} offline. Periksa kabel dan kertas, lalu coba lagi.`
        );
      }
      if (status?.state === "disabled") {
        const enabled = await enableCupsPrinter(printSettings, printSettings?.printer_name ?? undefined);
        if (!enabled?.ok) {
          throw new Error(
            `Printer ${status.printer || "default"} disabled dan gagal diaktifkan. Periksa CUPS.`
          );
        }
      }
      const result = await submitCupsPrint(printSettings, sheets, {
        sessionId: jobId,
        framed,
        canvasAspect,
        reprint,
        ...(reprint ? { dedupeKey: `${jobId}:reprint:${Date.now()}` } : {}),
      });
      serverJobRef.current = result.job_id;
      if (result.status === "failed") {
        printingRef.current = false;
        setError(result.error || "CUPS gagal mencetak.");
        setState("error");
        return;
      }
      setJobState(result.status);
      if (result.job_id) setPollJobId(result.job_id);
      finish(true);
    } catch (cause) {
      printingRef.current = false;
      setError(cause instanceof Error ? cause.message : "CUPS gagal mencetak.");
      setState("error");
    }
  }, [canvasAspect, finish, framed, jobId, photos, printSettings, reprint, sheetIndexes]);

  useEffect(() => {
    if (plan.kind === "digital") {
      finish(false);
      return;
    }
    let cancelled = false;
    const prepare = async () => {
      if (printingRef.current || doneRef.current) return;
      await Promise.resolve();
      if (cancelled) return;
      setState("ready");
      if (!auto) return;
      const bypassClaim = reprint || manualRetryRef.current;
      if (!claimAutoPrint(bypassClaim)) {
        setError("Cetak otomatis untuk sesi ini sudah pernah dikirim.");
        setState("error");
        return;
      }
      void print();
    };
    void prepare();
    return () => {
      cancelled = true;
      printingRef.current = false;
    };
  }, [auto, claimAutoPrint, finish, jobId, plan.kind, print, reprint, retryKey]);

  // Polling status job: 1,5 detik, maksimum 30 detik. Tidak pernah
  // mengonfirmasi sendiri — `done` tetap milik operator.
  useEffect(() => {
    if (!pollJobId || state !== "done") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const startedAt = Date.now();
    const tick = async () => {
      if (cancelled) return;
      const job = await fetchPrintJob(printSettings, pollJobId);
      if (cancelled) return;
      if (job) {
        setJobState(job.status);
        if (job.status === "failed") {
          setPollJobId(null);
          setError(job.error || "CUPS gagal mencetak.");
          setState("error");
          return;
        }
        if (job.status === "done") {
          setPollJobId(null);
          return;
        }
      }
      if (Date.now() - startedAt >= 30_000) {
        setPollJobId(null);
        return;
      }
      timer = setTimeout(() => void tick(), 1_500);
    };
    timer = setTimeout(() => void tick(), 1_500);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [pollJobId, printSettings, state]);

  /** Operator memastikan kertas keluar → job ditutup sebagai `done`. */
  const confirmPaperOut = async () => {
    if (confirmedRef.current) return;
    confirmedRef.current = true;
    const jobIdValue = serverJobRef.current;
    if (!jobIdValue || confirming) {
      onDone(true);
      return;
    }
    setConfirming(true);
    try {
      await confirmCupsJob(printSettings, jobIdValue);
    } catch {
      // Konfirmasi gagal (bridge mati setelah job terkirim) tidak boleh
      // menahan customer: kertas sudah keluar, sesi tetap lanjut.
    } finally {
      setConfirming(false);
      onDone(true);
    }
  };

  const retry = () => {
    doneRef.current = false;
    printingRef.current = false;
    manualRetryRef.current = true;
    setError(null);
    setState("loading");
    setRetryKey((value) => value + 1);
  };

  const skip = () => {
    // Hanya cegah melewati saat job masih dikirim. Setelah `done`, customer
    // boleh lanjut tanpa mengonfirmasi kertas (mis. kertas macet).
    if (state === "printing" || confirmedRef.current) return;
    confirmedRef.current = true;
    doneRef.current = true;
    onDone(false);
  };

  if (plan.kind === "digital") return null;

  return (
    <>
      <div className="fixed inset-0 z-30 flex flex-col items-center justify-center gap-5 overflow-y-auto bg-bg p-6 text-center md:p-8">
        {state === "error" ? (
          <>
            <TriangleAlert className="size-10 text-destructive" aria-hidden />
            <p className="font-display text-xl uppercase leading-none tracking-[-0.02em] md:text-2xl">
              CUPS gagal mencetak
            </p>
            <p className="max-w-[48ch] text-sm leading-relaxed text-muted-foreground">
              {error || "Periksa bridge lokal, CUPS, kertas, dan nama printer."}
            </p>
            <div className="flex w-full max-w-[52ch] flex-col gap-3 border-2 border-ink bg-surface px-4 py-3 text-left shadow-hard-sm">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em]">
                Langkah perbaikan
              </p>
              <ol className="flex flex-col gap-1 font-mono text-[10px] uppercase leading-relaxed tracking-[0.06em] text-muted-foreground">
                <li>1. Jalankan runtime bridge di komputer booth.</li>
                <li>2. Pastikan CUPS/spooler aktif dan printer tidak offline.</li>
                <li>3. Klik Coba lagi.</li>
                <li>4. Buka panduan bila masih gagal.</li>
              </ol>
              <p className="font-mono text-[10px] uppercase leading-relaxed tracking-[0.06em] text-muted-foreground">
                Panduan perangkat tersedia untuk petugas melalui dashboard. Jangan meninggalkan layar
                kiosk saat sesi pelanggan masih aktif.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              <Button size="lg" variant="neutral" onClick={retry}>
                Coba lagi
              </Button>
              <Button size="lg" onClick={skip}>
                Lanjut tanpa cetak
              </Button>
            </div>
          </>
        ) : state === "done" ? (
          <>
            <Check className="size-10 text-accent-3" aria-hidden />
            <p className="font-display text-xl uppercase leading-none tracking-[-0.02em] md:text-2xl">
              Perintah cetak terkirim
            </p>
            <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {`${totalSheets} LEMBAR · ${page.widthMm} × ${page.heightMm} MM · ${fit.toUpperCase()}`}
            </p>
            <p className="max-w-[44ch] text-[10px] uppercase leading-relaxed tracking-[0.1em] text-muted-foreground">
              {jobState === "queued"
                ? "Menunggu antrean printer."
                : jobState === "printing"
                  ? "Mencetak."
                  : "Menunggu kertas keluar. Konfirmasi setelah kertas benar-benar keluar."}
            </p>
            {qrPending && (
              <p className="max-w-[44ch] border-2 border-ink bg-accent-2 px-3 py-2 text-[10px] font-bold uppercase leading-relaxed tracking-[0.08em]">
                Hasil belum tersinkron. Lembar ini tanpa QR. Cetak ulang setelah QR tersedia.
              </p>
            )}
            <div className="flex flex-wrap justify-center gap-2.5">
              <Button
                size="lg"
                className="bg-accent"
                disabled={confirming}
                onClick={() => void confirmPaperOut()}
              >
                <Check className="size-5" aria-hidden /> Kertas keluar
              </Button>
              <Button size="lg" variant="neutral" onClick={skip}>
                Lanjut
              </Button>
            </div>
          </>
        ) : state === "ready" ? (
          <>
            <Printer className="size-10" aria-hidden />
            <p className="font-display text-xl uppercase leading-none tracking-[-0.02em] md:text-2xl">
              Siap dicetak
            </p>
            <p className="max-w-[48ch] text-sm leading-relaxed text-muted-foreground">
              {`${totalSheets} lembar · CUPS lokal · ${page.widthMm} × ${page.heightMm} mm · ${fit} · margin ${page.marginMm} mm`}
            </p>
            <div className="flex flex-wrap justify-center gap-2.5">
              {!auto && (
                <Button size="lg" onClick={() => void print()}>
                  <Printer className="size-5" aria-hidden /> Cetak
                </Button>
              )}
              <Button size="lg" variant="neutral" onClick={skip}>
                Lanjut
              </Button>
            </div>
          </>
        ) : (
          <>
            <Loader2 className="size-10 motion-safe:animate-spin" aria-hidden />
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
