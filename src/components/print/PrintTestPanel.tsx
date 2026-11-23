"use client";

import { useCallback, useState } from "react";
import { Bluetooth, Check, Loader2, Printer, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { encodeEscPos } from "@/lib/print/escpos";
import { rasterizePhoto, rasterizeTestPattern } from "@/lib/print/photo-bitmap";
import { BluetoothPrintError, connectEscPos, requestEscPosDevice } from "@/lib/print/bluetooth";
import type { PrintMode } from "@/lib/print/print-mode";
import { THERMAL_WIDTH_DOTS } from "@/lib/print/print-mode";
import { printContentHeightMm, printPageSize } from "@/lib/print-layout";
import { SerialPrintError, writeEscPosSerial } from "@/lib/print/serial";
import { usePrintTransport } from "@/hooks/use-print-transport";
import type { PrintSettingsInput } from "@/lib/print-layout";
import { submitCupsTest } from "@/lib/print/cups";

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
  lastTest?: {
    confirmed?: boolean;
    last_test_at?: string;
    mode?: string;
    device_name?: string;
  } | null;
  onReport: (result: PrintTestResult) => Promise<void> | void;
  /** Tampilkan tombol konfirmasi hasil fisik (dashboard), wizard memakai copy sendiri. */
  canReport?: boolean;
  printSettings?: PrintSettingsInput | null;
};

type Phase = "idle" | "connecting" | "printing" | "sent" | "error";
type SampleKind = "pattern" | "photo";

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
  printSettings,
}: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [deviceName, setDeviceName] = useState<string | null>(lastTest?.device_name ?? null);
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);
  const [serialBusy, setSerialBusy] = useState(false);
  const [sampleKind, setSampleKind] = useState<SampleKind>("pattern");
  const widthDots = paperWidthMm === 58 ? THERMAL_WIDTH_DOTS[58] : THERMAL_WIDTH_DOTS[80];

  /** Pola uji bawaan atau foto nyata dari aset marketing. */
  const buildBitmap = useCallback(async () => {
    if (sampleKind === "photo") {
      const response = await fetch("/dashboard-preview.png");
      if (!response.ok) throw new Error("Foto uji tidak bisa dimuat.");
      return rasterizePhoto(await response.blob(), widthDots, 1152);
    }
    return rasterizeTestPattern(widthDots, sample.lines);
  }, [sample.lines, sampleKind, widthDots]);

  const sendThermal = useCallback(
    async (acceptAll = false) => {
      setPhase("connecting");
      setMessage(null);
      try {
        const device = await requestEscPosDevice({ acceptAll });
        const name = device.name ?? "Printer Bluetooth";
        setDeviceName(name);
        const link = await connectEscPos(device);
        try {
          setPhase("printing");
          const bitmap = await buildBitmap();
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
    },
    [buildBitmap, deviceName, sample.title]
  );

  /** Printer Classic SPP tidak muncul di Web Bluetooth; Web Serial desktop
   *  memakai port hasil pairing tanpa driver tambahan. */
  const sendSerial = useCallback(async () => {
    setSerialBusy(true);
    setPhase("printing");
    setMessage(null);
    try {
      const bitmap = await buildBitmap();
      const bytes = encodeEscPos([
        { kind: "text", text: sample.title, align: "center", emphasis: true, size: 2 },
        { kind: "text", text: "WEB SERIAL / SPP", align: "center" },
        { kind: "raster", bitmap },
        { kind: "feed", lines: 2 },
        { kind: "cut", partial: true },
      ]);
      await writeEscPosSerial(bytes);
      setDeviceName((current) => current ?? "Printer serial (SPP)");
      setPhase("sent");
    } catch (error) {
      if (error instanceof SerialPrintError && error.code === "NO_PORT") {
        setPhase("idle");
        return;
      }
      setPhase("error");
      setMessage(
        error instanceof SerialPrintError
          ? error.message
          : "Gagal mengirim halaman uji lewat Web Serial."
      );
    } finally {
      setSerialBusy(false);
    }
  }, [buildBitmap, sample.title]);

  async function sendBrowser() {
    if (mode === "cups") {
      setPhase("printing");
      setMessage(null);
      try {
        await submitCupsTest(printSettings, sample);
        setPhase("sent");
      } catch (error) {
        setPhase("error");
        setMessage(error instanceof Error ? error.message : "Gagal mengirim uji cetak ke CUPS.");
      }
      return;
    }
    const page = printPageSize(printSettings);
    const style = document.createElement("style");
    style.id = "snapyos-print-test-css";
    style.textContent = `
      @page { size: ${page.widthMm}mm ${page.heightMm}mm; margin: ${page.marginMm}mm; }
      @media print {
        body:has(.snapyos-print-test) * { visibility: hidden !important; }
        .snapyos-print-test, .snapyos-print-test * { visibility: visible !important; }
        .snapyos-print-test { display: block !important; position: fixed; inset: 0; }
        .snapyos-print-test-page {
          box-sizing: border-box; width: 100%; height: ${printContentHeightMm(page)}mm;
          display: flex; flex-direction: column; border: 1px solid #111; padding: 0;
          color: #111; font-family: monospace;
        }
      }
    `;
    document.head.appendChild(style);
    const cleanup = () => {
      style.remove();
      window.removeEventListener("afterprint", cleanup);
      setPhase("sent");
    };
    window.addEventListener("afterprint", cleanup);
    try {
      window.print();
    } catch {
      cleanup();
      setPhase("error");
      setMessage("Dialog cetak gagal dibuka.");
    }
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

  const transport = usePrintTransport();
  const supported = transport.bluetooth;
  const serialSupported = transport.serial;
  const busy = phase === "connecting" || phase === "printing" || serialBusy;

  return (
    <section
      aria-labelledby="print-test-heading"
      className="flex flex-col gap-5 border-2 border-ink bg-surface p-5 shadow-[4px_4px_0_0_#111111] md:p-6"
    >
      <header className="flex flex-col gap-2 border-b-2 border-ink pb-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
          {"UJI CETAK"}
        </p>
        <h2 id="print-test-heading" className="font-display text-2xl uppercase tracking-tight">
          Test printer
        </h2>
        <p className="max-w-[60ch] text-sm leading-relaxed text-muted-foreground">
          {mode === "bluetooth"
            ? `Booth memakai printer thermal Bluetooth ${paperWidthMm}mm (ESC/POS). Cetak halaman uji, lalu konfirmasi hasil fisiknya.`
            : mode === "cups"
              ? "Booth memakai bridge CUPS lokal. Pastikan bridge berjalan, CUPS aktif, dan printer sudah terpasang."
              : "Booth memakai dialog cetak sistem. Pastikan printer foto default sudah terpasang, lalu cetak halaman uji dan konfirmasi hasil fisiknya."}
        </p>
      </header>

      <dl className="grid grid-cols-1 gap-3 font-mono text-xs uppercase tracking-[0.08em] sm:grid-cols-2">
        <div className="flex flex-col gap-1 border-2 border-ink/20 p-3">
          <dt className="text-muted-foreground">Mode cetak</dt>
          <dd className="font-bold">
            {mode === "bluetooth"
              ? "Bluetooth thermal"
              : mode === "cups"
                ? "CUPS lokal"
                : "Dialog sistem"}
          </dd>
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
        <p
          role="alert"
          className="border-2 border-destructive bg-destructive/10 px-3 py-2 font-mono text-xs text-ink"
        >
          Browser ini tidak mendukung Web Bluetooth. Gunakan Chrome di Android atau desktop.
        </p>
      )}

      {message && (
        <p
          role="alert"
          className="border-2 border-destructive bg-destructive/10 px-3 py-2 font-mono text-xs text-ink"
        >
          {message}
        </p>
      )}

      {mode === "bluetooth" && (
        <fieldset className="flex flex-col gap-2 border-2 border-ink/20 p-3">
          <legend className="px-1 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            Isi halaman uji
          </legend>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["pattern", "Pola & teks"],
                ["photo", "Foto nyata"],
              ] as const
            ).map(([value, label]) => (
              <label
                key={value}
                className={`flex min-h-11 cursor-pointer items-center gap-2 border-2 border-ink px-3 font-mono text-xs font-bold uppercase tracking-[0.08em] ${
                  sampleKind === value ? "bg-accent text-ink" : "bg-surface text-ink"
                }`}
              >
                <input
                  type="radio"
                  name="print_sample_kind"
                  value={value}
                  checked={sampleKind === value}
                  onChange={() => setSampleKind(value)}
                  className="size-4 accent-ink"
                />
                {label}
              </label>
            ))}
          </div>
          <p className="font-mono text-[10px] uppercase leading-relaxed tracking-[0.08em] text-muted-foreground">
            {sampleKind === "photo"
              ? "Foto dikonversi ke hitam-putih 1-bit; periksa kontras dan tepi gambar pada hasil fisik."
              : "Pola garis dan teks memverifikasi lebar kertas serta perataan."}
          </p>
        </fieldset>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          size="lg"
          className="bg-accent"
          disabled={busy || (mode === "bluetooth" && !supported)}
          onClick={() => (mode === "bluetooth" ? void sendThermal() : void sendBrowser())}
        >
          {busy ? (
            <Loader2 className="size-5 animate-spin" aria-hidden />
          ) : mode === "bluetooth" ? (
            <Bluetooth className="size-5" aria-hidden />
          ) : (
            <Printer className="size-5" aria-hidden />
          )}
          {phase === "connecting"
            ? "Menghubungkan…"
            : phase === "printing"
              ? "Mengirim…"
              : "Cetak halaman uji"}
        </Button>
        {mode === "bluetooth" && supported && !busy && (
          <button
            type="button"
            onClick={() => void sendThermal(true)}
            className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground underline underline-offset-4 hover:text-ink"
          >
            Printer tidak muncul? Cari semua perangkat
          </button>
        )}
        {mode === "bluetooth" && serialSupported && (
          <button
            type="button"
            onClick={() => void sendSerial()}
            disabled={busy}
            className="min-h-11 border-2 border-ink bg-surface px-3 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-ink shadow-[2px_2px_0_0_#111111] transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
          >
            Printer Classic (SPP) · Web Serial
          </button>
        )}
        {phase === "sent" && (
          <span
            role="status"
            className="inline-flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-[0.1em]"
          >
            <Check className="size-4 text-accent-3" aria-hidden /> Perintah cetak terkirim
          </span>
        )}
      </div>

      <div aria-hidden className="snapyos-print-test hidden print:block">
        <div className="snapyos-print-test-page">
          <h1>{sample.title}</h1>
          {sample.lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
          <div style={{ marginTop: "auto", height: 6, background: "#111" }} />
        </div>
      </div>

      {mode === "bluetooth" && serialSupported && (
        <p className="font-mono text-[10px] uppercase leading-relaxed tracking-[0.08em] text-muted-foreground">
          Printer Classic (RPP/RTP) tidak muncul di Bluetooth? Pair di OS lalu pakai Web Serial
          (Chrome desktop).
        </p>
      )}

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
              {reporting ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Check className="size-4" aria-hidden />
              )}
              Ya, berhasil
            </Button>
            <Button
              type="button"
              variant="neutral"
              onClick={() => void report(false)}
              disabled={reporting}
            >
              <TriangleAlert className="size-4" aria-hidden /> Tidak, gagal
            </Button>
          </div>
          {reported && (
            <p
              role="status"
              className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground"
            >
              Hasil uji tersimpan.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
