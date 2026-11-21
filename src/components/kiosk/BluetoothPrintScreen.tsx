"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bluetooth, Check, Loader2, Printer, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { encodeEscPos, type EscPosBlock } from "@/lib/print/escpos";
import {
  printSheets,
  printCopies,
  shouldAutoPrint,
  type PrintPlan,
  type PrintSettingsInput,
} from "@/lib/print-layout";
import { bluetoothWidthDots } from "@/lib/print/print-mode";
import { rasterizePhoto } from "@/lib/print/photo-bitmap";
import {
  BluetoothPrintError,
  connectEscPos,
  requestEscPosDevice,
  type EscPosLink,
} from "@/lib/print/bluetooth";
import { SerialPrintError, writeEscPosSerial, writeEscPosSerialGranted } from "@/lib/print/serial";
import { useAutoPrintJob } from "@/hooks/use-auto-print-job";
import { usePrintTransport } from "@/hooks/use-print-transport";
import { rememberThermalPrinter } from "@/components/kiosk/local-runtime";

type Props = {
  photos: { blob: Blob }[];
  plan: PrintPlan;
  printSettings?: PrintSettingsInput | null;
  /** ID sesi/order untuk dedupe auto-print lintas remount & refresh. */
  jobId?: string;
  /** true = cetak ulang eksplisit; lewati claim auto-print. */
  reprint?: boolean;
  /** success=true → job terkirim penuh ke printer (bukan konfirmasi fisik). */
  onDone: (success: boolean) => void;
  /** Printer bukan ESC/POS: pindah ke dialog OS tanpa mengulang sesi. */
  onUseBrowserPrint: () => void;
};

type State = "idle" | "connecting" | "preparing" | "printing" | "done" | "error";

/**
 * Cetak thermal ESC/POS lewat Web Bluetooth.
 *
 * Semua state non-terminal punya jalan keluar ("Lanjut"): booth tidak boleh
 * berhenti di layar cetak ketika printer mati, kertas habis, atau koneksi
 * terputus. Job yang putus di tengah jalan bisa meninggalkan lembar parsial ,
 * itu disebut eksplisit di pesan `Coba lagi`, bukan disembunyikan.
 */
export function BluetoothPrintScreen({
  photos,
  plan,
  printSettings,
  jobId,
  reprint = false,
  onDone,
  onUseBrowserPrint,
}: Props) {
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ sheet: number; total: number } | null>(null);
  const [printerName, setPrinterName] = useState<string | null>(
    printSettings?.bluetooth_device_name ?? null
  );
  const linkRef = useRef<EscPosLink | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const doneRef = useRef(false);

  const auto = shouldAutoPrint(printSettings);
  const autoJob = useAutoPrintJob({ scope: "kiosk", id: jobId, reprint, auto });
  const copies = printCopies(printSettings);
  const widthDots = bluetoothWidthDots(printSettings);
  const paperWidthMm: 58 | 80 = widthDots === 384 ? 58 : 80;
  const bridgeUrl = printSettings?.bridge_url ?? null;
  const transport = usePrintTransport();
  const supported = transport.bluetooth;
  const serialSupported = transport.serial;

  const finish = useCallback(
    (success: boolean) => {
      if (doneRef.current) return;
      doneRef.current = true;
      onDone(success);
    },
    [onDone]
  );

  /** Bangun byte ESC/POS untuk semua lembar. */
  const buildJob = useCallback(async (): Promise<Uint8Array> => {
    const sheets = printSheets(plan, photos.length, copies);
    if (sheets.length === 0) throw new Error("Tidak ada foto untuk dicetak.");
    const blocks: EscPosBlock[] = [];
    for (let i = 0; i < sheets.length; i++) {
      setProgress({ sheet: i + 1, total: sheets.length });
      for (const photoIndex of sheets[i]!) {
        const photo = photos[photoIndex];
        if (!photo) continue;
        const bitmap = await rasterizePhoto(photo.blob, widthDots);
        blocks.push({ kind: "raster", bitmap });
      }
      if (i < sheets.length - 1) blocks.push({ kind: "feed", lines: 4 });
    }
    blocks.push({ kind: "cut", partial: true });
    return encodeEscPos(blocks);
  }, [copies, photos, plan, widthDots]);

  const run = useCallback(
    async (link: EscPosLink) => {
      const controller = new AbortController();
      abortRef.current = controller;
      setState("preparing");
      setMessage(null);
      try {
        const job = await buildJob();
        if (controller.signal.aborted) return;
        setState("printing");
        await link.write(job, { signal: controller.signal });
        setState("done");
        setTimeout(() => finish(true), 600);
      } catch (error) {
        if (controller.signal.aborted) return;
        const reason =
          error instanceof BluetoothPrintError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Gagal mencetak.";
        setMessage(reason);
        setState("error");
      } finally {
        abortRef.current = null;
      }
    },
    [buildJob, finish]
  );

  const connectAndPrint = useCallback(
    async (acceptAll = false) => {
      setState("connecting");
      setMessage(null);
      try {
        const device = await requestEscPosDevice({ acceptAll });
        setPrinterName(device.name ?? "Printer Bluetooth");
        const link = await connectEscPos(device);
        linkRef.current = link;
        // Koneksi sukses = satu-satunya bukti printer ini dipakai booth.
        void rememberThermalPrinter({ name: device.name, paperWidthMm }, bridgeUrl);
        await run(link);
      } catch (error) {
        if (error instanceof BluetoothPrintError && error.code === "NO_DEVICE") {
          setState("idle");
          return;
        }
        setMessage(
          error instanceof BluetoothPrintError
            ? error.message
            : "Gagal menghubungkan printer Bluetooth."
        );
        setState("error");
      }
    },
    [bridgeUrl, paperWidthMm, run]
  );

  /** Jalur printer Classic SPP: Web Serial mengirim job yang sama. */
  const connectAndPrintSerial = useCallback(async () => {
    setState("connecting");
    setMessage(null);
    try {
      const job = await buildJob();
      setState("printing");
      await writeEscPosSerial(job);
      setPrinterName((current) => current ?? "Printer serial (SPP)");
      setState("done");
      setTimeout(() => finish(true), 600);
    } catch (error) {
      if (error instanceof SerialPrintError && error.code === "NO_PORT") {
        setState("idle");
        return;
      }
      setMessage(
        error instanceof SerialPrintError
          ? error.message
          : "Gagal mengirim job ke printer lewat Web Serial."
      );
      setState("error");
    }
  }, [buildJob, finish]);

  /** Auto-print SPP: pakai port yang sudah diizinkan, tanpa chooser. */
  const autoPrintSerial = useCallback(async () => {
    setState("preparing");
    setMessage(null);
    try {
      const job = await buildJob();
      setState("printing");
      const sent = await writeEscPosSerialGranted(job);
      if (!sent) {
        setState("idle");
        return;
      }
      setPrinterName((current) => current ?? "Printer serial (SPP)");
      setState("done");
      setTimeout(() => finish(true), 600);
    } catch (error) {
      if (error instanceof SerialPrintError && error.code === "NO_PORT") {
        setState("idle");
        return;
      }
      setMessage(
        error instanceof SerialPrintError
          ? error.message
          : "Gagal mengirim job ke printer lewat Web Serial."
      );
      setState("error");
    }
  }, [buildJob, finish]);

  const retry = useCallback(async () => {
    const link = linkRef.current;
    if (!link) {
      await connectAndPrint();
      return;
    }
    try {
      // Koneksi lama mungkin mati; sambungkan ulang device yang sama.
      const fresh = await connectEscPos(link.device);
      linkRef.current = fresh;
      await run(fresh);
    } catch {
      linkRef.current = null;
      await connectAndPrint();
    }
  }, [connectAndPrint, run]);

  // auto_print: hubungkan + cetak tanpa klik tambahan HANYA bila izin
  // perangkat sudah ada (getDevices). Tanpa izin, Chrome wajib gestur, jadi
  // layar menampilkan tombol "Hubungkan printer".
  useEffect(() => {
    if (!auto) return;
    // Claim sekali per job SEBELUM menyentuh printer. React Strict Mode
    // menjalankan effect dua kali; tanpa claim ini satu sesi bisa tercetak dua
    // kali. jobId kosong = hanya guard ref per mount (tidak ada kunci stabil).
    // Ref menahan Strict Mode double-effect (instance sama) agar percobaan
    // kedua tetap jalan tanpa mengklaim ulang; storage menahan remount/refresh.
    if (!autoJob.claim()) return;
    let cancelled = false;
    void (async () => {
      if (supported) {
        const { reconnectGranted } = await import("@/lib/print/bluetooth");
        const device = await reconnectGranted();
        if (cancelled) return;
        if (device) {
          try {
            const link = await connectEscPos(device);
            if (cancelled) {
              link.disconnect();
              return;
            }
            linkRef.current = link;
            setPrinterName(device.name ?? "Printer Bluetooth");
            void rememberThermalPrinter({ name: device.name, paperWidthMm }, bridgeUrl);
            await run(link);
            return;
          } catch {
            // Izin ada tetapi printer mati → coba jalur SPP di bawah.
          }
        }
      }
      if (serialSupported) await autoPrintSerial();
    })();
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
    // Sekali saat layar cetak dibuka.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Putus koneksi saat layar ditinggal (bukan saat job berjalan, abort dulu).
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      linkRef.current?.disconnect();
      linkRef.current = null;
    };
  }, []);

  function leave(success: boolean) {
    abortRef.current?.abort();
    finish(success);
  }

  const busy = state === "connecting" || state === "preparing" || state === "printing";

  return (
    <div className="fixed inset-0 z-30 flex flex-col items-center justify-center gap-5 overflow-y-auto bg-bg p-6 text-center md:p-8">
      {!supported && !serialSupported ? (
        <>
          <TriangleAlert className="size-10 shrink-0 text-destructive" aria-hidden />
          <p className="font-display text-xl uppercase leading-none tracking-[-0.02em] md:text-2xl">
            Bluetooth tidak tersedia
          </p>
          <p className="max-w-[46ch] text-sm leading-relaxed text-muted-foreground">
            Browser ini tidak mendukung Web Bluetooth maupun Web Serial. Gunakan Chrome desktop atau
            Android, atau cetak lewat dialog sistem.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button size="lg" variant="neutral" onClick={onUseBrowserPrint}>
              Cetak lewat dialog
            </Button>
            <Button size="lg" className="bg-accent" onClick={() => leave(false)}>
              Lanjut
            </Button>
          </div>
        </>
      ) : state === "done" ? (
        <>
          <Check className="size-10 shrink-0 text-accent-3" aria-hidden />
          <p className="font-display text-xl uppercase leading-none tracking-[-0.02em] md:text-2xl">
            Perintah cetak terkirim
          </p>
          <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {`${printerName ?? "PRINTER BLUETOOTH"}`}
          </p>
        </>
      ) : state === "error" ? (
        <>
          <TriangleAlert className="size-10 shrink-0 text-destructive" aria-hidden />
          <p className="font-display text-xl uppercase leading-none tracking-[-0.02em] md:text-2xl">
            Gagal mencetak
          </p>
          <p className="max-w-[48ch] text-sm leading-relaxed text-muted-foreground">
            {message ?? "Printer tidak merespons."}
          </p>
          {message?.includes("dialog cetak sistem") ? (
            <div className="flex flex-wrap justify-center gap-3">
              <Button size="lg" onClick={onUseBrowserPrint} className="bg-accent">
                Cetak lewat dialog
              </Button>
              <Button size="lg" variant="neutral" onClick={() => leave(false)}>
                Lanjut
              </Button>
            </div>
          ) : (
            <>
              <p className="max-w-[48ch] text-xs leading-relaxed text-muted-foreground">
                Sebagian lembar mungkin sudah tercetak. Periksa printer sebelum mencoba lagi.
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <Button size="lg" onClick={() => void retry()} className="bg-accent">
                  Coba lagi
                </Button>
                <Button size="lg" variant="neutral" onClick={() => leave(false)}>
                  Lanjut tanpa cetak
                </Button>
              </div>
            </>
          )}
        </>
      ) : busy ? (
        <>
          <Loader2 className="size-10 shrink-0 motion-safe:animate-spin" aria-hidden />
          <p className="font-display text-xl uppercase leading-none tracking-[-0.02em] md:text-2xl">
            {state === "connecting"
              ? "Menghubungkan printer"
              : state === "preparing"
                ? "Menyiapkan lembar"
                : "Mencetak"}
          </p>
          <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {progress ? `LEMBAR ${progress.sheet} / ${progress.total}` : "SIAPKAN KERTAS"}
          </p>
          <Button size="lg" variant="neutral" onClick={() => leave(false)}>
            Lanjut
          </Button>
        </>
      ) : !supported && serialSupported ? (
        <>
          <Bluetooth className="size-10 shrink-0" aria-hidden />
          <p className="font-display text-xl uppercase leading-none tracking-[-0.02em] md:text-2xl">
            Cetak ke printer Bluetooth
          </p>
          <p className="max-w-[46ch] text-sm leading-relaxed text-muted-foreground">
            Web Bluetooth tidak tersedia, tetapi Web Serial bisa dipakai untuk printer Classic (SPP)
            yang sudah di-pair di OS.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button size="lg" onClick={() => void connectAndPrintSerial()} className="bg-accent">
              <Printer className="size-5" aria-hidden /> Hubungkan printer (SPP)
            </Button>
            <Button size="lg" variant="neutral" onClick={onUseBrowserPrint}>
              Cetak lewat dialog
            </Button>
            <Button size="lg" variant="neutral" onClick={() => leave(false)}>
              Lanjut
            </Button>
          </div>
        </>
      ) : (
        <>
          <Bluetooth className="size-10 shrink-0" aria-hidden />
          <p className="font-display text-xl uppercase leading-none tracking-[-0.02em] md:text-2xl">
            Cetak ke printer Bluetooth
          </p>
          <p className="max-w-[46ch] text-sm leading-relaxed text-muted-foreground">
            {printerName
              ? `Printer terakhir: ${printerName}. Nyalakan printer lalu hubungkan.`
              : "Nyalakan printer thermal, aktifkan Bluetooth, lalu hubungkan."}
          </p>
          <p className="max-w-[46ch] border-2 border-ink bg-accent-2 px-3 py-2 text-[10px] font-bold uppercase leading-relaxed tracking-[0.08em]">
            Thermal 1-bit (384/576 dot) — bukan cetak foto. Untuk hasil foto gunakan CUPS atau
            dialog OS.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button size="lg" onClick={() => void connectAndPrint()} className="bg-accent">
              <Printer className="size-5" aria-hidden /> Hubungkan printer
            </Button>
            <Button size="lg" variant="neutral" onClick={onUseBrowserPrint}>
              Cetak lewat dialog
            </Button>
            <Button size="lg" variant="neutral" onClick={() => leave(false)}>
              Lanjut
            </Button>
          </div>
          {/* Printer yang tidak muncul di daftar filter tetap bisa dipilih;
              koneksi divalidasi lewat karakteristik write saat menyambung. */}
          <button
            type="button"
            onClick={() => void connectAndPrint(true)}
            className="min-h-11 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground underline underline-offset-4 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            Printer tidak muncul? Cari semua perangkat
          </button>
          {serialSupported && (
            <button
              type="button"
              onClick={() => void connectAndPrintSerial()}
              className="min-h-11 border-2 border-ink bg-surface px-3 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-ink shadow-hard-sm transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              Printer Classic (SPP) · Web Serial
            </button>
          )}
        </>
      )}
    </div>
  );
}
