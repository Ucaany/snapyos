"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bluetooth, Check, Loader2, Printer, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { encodeEscPos, type EscPosBlock } from "@/lib/print/escpos";
import { printSheets, printCopies, shouldAutoPrint, type PrintPlan, type PrintSettingsInput } from "@/lib/print-layout";
import { bluetoothWidthDots } from "@/lib/print/print-mode";
import { rasterizePhoto } from "@/lib/print/photo-bitmap";
import {
  BluetoothPrintError,
  connectEscPos,
  isBluetoothPrintSupported,
  requestEscPosDevice,
  type EscPosLink,
} from "@/lib/print/bluetooth";

type Props = {
  photos: { blob: Blob }[];
  plan: PrintPlan;
  printSettings?: PrintSettingsInput | null;
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
export function BluetoothPrintScreen({ photos, plan, printSettings, onDone, onUseBrowserPrint }: Props) {
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
  const copies = printCopies(printSettings);
  const widthDots = bluetoothWidthDots(printSettings);
  const supported = typeof navigator !== "undefined" && isBluetoothPrintSupported();

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

  const connectAndPrint = useCallback(async (acceptAll = false) => {
    setState("connecting");
    setMessage(null);
    try {
      const device = await requestEscPosDevice({ acceptAll });
      setPrinterName(device.name ?? "Printer Bluetooth");
      const link = await connectEscPos(device);
      linkRef.current = link;
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
  }, [run]);

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
    if (!auto || !supported) return;
    let cancelled = false;
    void (async () => {
      const { reconnectGranted } = await import("@/lib/print/bluetooth");
      const device = await reconnectGranted();
      if (!device || cancelled) return;
      try {
        const link = await connectEscPos(device);
        if (cancelled) {
          link.disconnect();
          return;
        }
        linkRef.current = link;
        setPrinterName(device.name ?? "Printer Bluetooth");
        await run(link);
      } catch {
        // Izin ada tetapi printer mati → tombol manual tetap tersedia.
      }
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
    <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-5 bg-bg p-8 text-center">
      {!supported ? (
        <>
          <TriangleAlert className="size-12 text-destructive" aria-hidden />
          <p className="font-display text-2xl uppercase leading-none tracking-tight">
            Bluetooth tidak tersedia
          </p>
          <p className="max-w-[46ch] font-mono text-xs uppercase leading-relaxed tracking-[0.1em] text-muted-foreground">
            Browser ini tidak mendukung Web Bluetooth. Gunakan Chrome di Android atau desktop,
            atau cetak lewat dialog sistem.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button size="lg" variant="outline" onClick={onUseBrowserPrint}>
              Cetak lewat dialog
            </Button>
            <Button size="lg" className="bg-accent" onClick={() => leave(false)}>
              Lanjut
            </Button>
          </div>
        </>
      ) : state === "done" ? (
        <>
          <Check className="size-12 text-accent-3" aria-hidden />
          <p className="font-display text-2xl uppercase leading-none tracking-tight">
            Perintah cetak terkirim
          </p>
          <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            {`/// ${printerName ?? "PRINTER BLUETOOTH"}`}
          </p>
        </>
      ) : state === "error" ? (
        <>
          <TriangleAlert className="size-12 text-destructive" aria-hidden />
          <p className="font-display text-2xl uppercase leading-none tracking-tight">Gagal mencetak</p>
          <p className="max-w-[48ch] font-mono text-xs uppercase leading-relaxed tracking-[0.1em] text-muted-foreground">
            {message ?? "Printer tidak merespons."}
          </p>
          {message?.includes("dialog cetak sistem") ? (
            <div className="flex flex-wrap justify-center gap-3">
              <Button size="lg" onClick={onUseBrowserPrint} className="bg-accent">
                Cetak lewat dialog
              </Button>
              <Button size="lg" variant="outline" onClick={() => leave(false)}>
                Lanjut
              </Button>
            </div>
          ) : (
            <>
              <p className="max-w-[48ch] font-mono text-[10px] uppercase leading-relaxed tracking-[0.08em] text-muted-foreground">
                Sebagian lembar mungkin sudah tercetak. Periksa printer sebelum mencoba lagi.
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <Button size="lg" onClick={() => void retry()} className="bg-accent">
                  Coba lagi
                </Button>
                <Button size="lg" variant="outline" onClick={() => leave(false)}>
                  Lanjut tanpa cetak
                </Button>
              </div>
            </>
          )}
        </>
      ) : busy ? (
        <>
          <Loader2 className="size-12 animate-spin" aria-hidden />
          <p className="font-display text-2xl uppercase leading-none tracking-tight">
            {state === "connecting"
              ? "Menghubungkan printer"
              : state === "preparing"
                ? "Menyiapkan lembar"
                : "Mencetak"}
          </p>
          <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            {progress ? `/// LEMBAR ${progress.sheet} / ${progress.total}` : "/// SIAPKAN KERTAS"}
          </p>
          <Button size="lg" variant="outline" onClick={() => leave(false)}>
            Lanjut
          </Button>
        </>
      ) : (
        <>
          <Bluetooth className="size-12" aria-hidden />
          <p className="font-display text-2xl uppercase leading-none tracking-tight">
            Cetak ke printer Bluetooth
          </p>
          <p className="max-w-[46ch] font-mono text-xs uppercase leading-relaxed tracking-[0.1em] text-muted-foreground">
            {printerName
              ? `Printer terakhir: ${printerName}. Nyalakan printer lalu hubungkan.`
              : "Nyalakan printer thermal, aktifkan Bluetooth, lalu hubungkan."}
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button size="lg" onClick={() => void connectAndPrint()} className="bg-accent">
              <Printer className="size-5" aria-hidden /> Hubungkan printer
            </Button>
            <Button size="lg" variant="outline" onClick={onUseBrowserPrint}>
              Cetak lewat dialog
            </Button>
            <Button size="lg" variant="outline" onClick={() => leave(false)}>
              Lanjut
            </Button>
          </div>
          {/* Printer yang tidak muncul di daftar filter tetap bisa dipilih;
              koneksi divalidasi lewat karakteristik write saat menyambung. */}
          <button
            type="button"
            onClick={() => void connectAndPrint(true)}
            className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground underline underline-offset-4 hover:text-ink"
          >
            Printer tidak muncul? Cari semua perangkat
          </button>
        </>
      )}
    </div>
  );
}
