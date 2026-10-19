"use client";

import { useCallback, useState } from "react";
import { Bluetooth, Check, Loader2, Printer, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { encodeEscPos } from "@/lib/print/escpos";
import { rasterizeTestPattern } from "@/lib/print/photo-bitmap";
import {
  BluetoothPrintError,
  connectEscPos,
  isBluetoothPrintSupported,
  requestEscPosDevice,
} from "@/lib/print/bluetooth";
import type { PrintMode } from "@/lib/print/print-mode";
import { THERMAL_WIDTH_DOTS } from "@/lib/print/print-mode";

export type PrintTestResult = {
  confirmed: boolean;
  mode: PrintMode;
  device_name?: string;
};

type Props = {
  mode: PrintMode;
  paperWidthMm: 58 | 80;
  sample: { title: string; lines: string[] };
  /** Status terakhir dari `device_status.printer` (opsional). */
  lastTest?: { confirmed?: boolean; last_test_at?: string; mode?: string; device_name?: string } | null;
  onReport: (result: PrintTestResult) => Promise<void> | void;
  /** Tampilkan tombol konfirmasi hasil fisik (dashboard), wizard memakai copy sendiri. */
  canReport?: boolean;
};

type Phase = "idle" | "connecting" | "printing" | "sent" | "error";

/**
 * Panel uji cetak, SATU implementasi untuk dashboard owner dan SetupWizard.
 *
 * Tombol "Cetak uji" mengirim halaman uji ke printer sesuai `mode`. Hasil fisik
 * tidak bisa dibaca browser, jadi setelah perintah terkirim panel meminta
 * konfirmasi petugas (Ya/Tidak) dan mengirimnya ke server.
 */
export function PrintTestPanel({
  mode,
  paperWidthMm,
  sample,
  lastTest,
  onReport,
  canReport = true,
}: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [deviceName, setDeviceName] = useState<string | null>(lastTest?.device_name ?? null);
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);
  const widthDots = paperWidthMm === 58 ? THERMAL_WIDTH_DOTS[58] : THERMAL_WIDTH_DOTS[80];

  const sendThermal = useCallback(async (acceptAll = false) => {
    setPhase("connecting");
    setMessage(null);
    try {
      const device = await requestEscPosDevice({ acceptAll });
      const name = device.name ?? "Printer Bluetooth";
      setDeviceName(name);
      const link = await connectEscPos(device);
      try {
        setPhase("printing");
        const bitmap = await rasterizeTestPattern(widthDots, sample.lines);
        const bytes = encodeEscPos([
          { kind: "text", text: sample.title, align: "center", emphasis: true, size: 2 },
          { kind: "text", text: `${deviceName ?? name}`, align: "center" },
          { kind: "raster", bitmap },
          { kind: "feed", lines: 2 },
          { kind: "cut", partial: true },
        ]);
        await link.write(bytes);
        setPhase("sent");
      } finally {
        link.disconnect();
      }
    } catch (error) {
      setPhase("error");
      setMessage(
        error instanceof BluetoothPrintError
          ? error.message
          : "Gagal mengirim halaman uji ke printer Bluetooth."
      );
    }
  }, [deviceName, sample.lines, sample.title, widthDots]);

  function sendBrowser() {
    // Halaman uji memakai kontrak print yang sama dengan `.print-root`.
    window.print();
    setPhase("sent");
  }

  async function report(confirmed: boolean) {
    setReporting(true);
    try {
      await onReport({ confirmed, mode, device_name: deviceName ?? undefined });
      setReported(true);
    } finally {
      setReporting(false);
    }
  }

  const supported = typeof navigator !== "undefined" && isBluetoothPrintSupported();

  return (
    <section
      aria-labelledby="print-test-heading"
      className="flex flex-col gap-5 border-2 border-ink bg-surface p-5 shadow-[4px_4px_0_0_#111111] md:p-6"
    >
      <header className="flex flex-col gap-2 border-b-2 border-ink pb-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
          {"/// UJI CETAK"}
        </p>
        <h2 id="print-test-heading" className="font-display text-2xl uppercase tracking-tight">
          Test printer
        </h2>
        <p className="max-w-[60ch] text-sm leading-relaxed text-muted-foreground">
          {mode === "bluetooth"
            ? `Booth memakai printer thermal Bluetooth ${paperWidthMm}mm (ESC/POS). Cetak halaman uji, lalu konfirmasi hasil fisiknya.`
            : "Booth memakai dialog cetak sistem. Pastikan printer foto default sudah terpasang, lalu cetak halaman uji dan konfirmasi hasil fisiknya."}
        </p>
      </header>

      <dl className="grid grid-cols-1 gap-3 font-mono text-xs uppercase tracking-[0.08em] sm:grid-cols-2">
        <div className="flex flex-col gap-1 border-2 border-ink/20 p-3">
          <dt className="text-muted-foreground">Mode cetak</dt>
          <dd className="font-bold">{mode === "bluetooth" ? "Bluetooth thermal" : "Dialog sistem"}</dd>
        </div>
        <div className="flex flex-col gap-1 border-2 border-ink/20 p-3">
          <dt className="text-muted-foreground">Kertas</dt>
          <dd className="font-bold">{mode === "bluetooth" ? `${paperWidthMm} mm` : "4x6 / A6"}</dd>
        </div>
        <div className="flex flex-col gap-1 border-2 border-ink/20 p-3">
          <dt className="text-muted-foreground">Printer terakhir</dt>
          <dd className="font-bold">{deviceName ?? "Belum dipilih"}</dd>
        </div>
        <div className="flex flex-col gap-1 border-2 border-ink/20 p-3">
          <dt className="text-muted-foreground">Uji terakhir</dt>
          <dd className="font-bold">
            {lastTest?.last_test_at
              ? `${lastTest.confirmed ? "Berhasil" : "Gagal"} · ${new Date(lastTest.last_test_at).toLocaleString("id-ID")}`
              : "Belum pernah"}
          </dd>
        </div>
      </dl>

      {mode === "bluetooth" && !supported && (
        <p role="alert" className="border-2 border-destructive bg-destructive/10 px-3 py-2 font-mono text-xs text-ink">
          Browser ini tidak mendukung Web Bluetooth. Gunakan Chrome di Android atau desktop.
        </p>
      )}

      {message && (
        <p role="alert" className="border-2 border-destructive bg-destructive/10 px-3 py-2 font-mono text-xs text-ink">
          {message}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          size="lg"
          className="bg-accent"
          disabled={phase === "connecting" || phase === "printing" || (mode === "bluetooth" && !supported)}
          onClick={() => (mode === "bluetooth" ? void sendThermal() : sendBrowser())}
        >
          {phase === "connecting" || phase === "printing" ? (
            <Loader2 className="size-5 animate-spin" aria-hidden />
          ) : mode === "bluetooth" ? (
            <Bluetooth className="size-5" aria-hidden />
          ) : (
            <Printer className="size-5" aria-hidden />
          )}
          {phase === "connecting" ? "Menghubungkan…" : phase === "printing" ? "Mengirim…" : "Cetak halaman uji"}
        </Button>
        {mode === "bluetooth" && supported && phase !== "connecting" && phase !== "printing" && (
          <button
            type="button"
            onClick={() => void sendThermal(true)}
            className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground underline underline-offset-4 hover:text-ink"
          >
            Printer tidak muncul? Cari semua perangkat
          </button>
        )}
        {phase === "sent" && (
          <span role="status" className="inline-flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-[0.1em]">
            <Check className="size-4 text-accent-3" aria-hidden /> Perintah cetak terkirim
          </span>
        )}
      </div>

      {phase === "sent" && canReport && (
        <div className="flex flex-col gap-3 border-t-2 border-ink/20 pt-4">
          <p className="font-mono text-xs font-bold uppercase tracking-[0.15em]">
            Apakah halaman uji tercetak dengan benar?
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              onClick={() => void report(true)}
              disabled={reporting}
              className="bg-accent-3"
            >
              {reporting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}
              Ya, berhasil
            </Button>
            <Button type="button" variant="outline" onClick={() => void report(false)} disabled={reporting}>
              <TriangleAlert className="size-4" aria-hidden /> Tidak, gagal
            </Button>
          </div>
          {reported && (
            <p role="status" className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              Hasil uji tersimpan.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
