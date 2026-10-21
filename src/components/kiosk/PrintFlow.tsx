"use client";

import { useState } from "react";
import { PrintLayoutRenderer } from "@/components/kiosk/PrintLayoutRenderer";
import { BluetoothPrintScreen } from "@/components/kiosk/BluetoothPrintScreen";
import { usePrintTransport } from "@/hooks/use-print-transport";
import { CupsPrintScreen } from "@/components/kiosk/CupsPrintScreen";
import { resolvePrintMode, type PrintModeInput } from "@/lib/print/print-mode";
import type { PrintPlan } from "@/lib/print-layout";

type Props = {
  photos: { blob: Blob }[];
  plan: PrintPlan;
  printSettings?: PrintModeInput | null;
  /** ID sesi untuk dedupe auto-print (dipakai jalur thermal). */
  jobId?: string;
  /** true = customer menekan "Cetak ulang"; jangan pakai guard auto-print. */
  reprint?: boolean;
  /** success=true → permintaan cetak terkirim (browser tidak memberi status fisik). */
  onDone: (success: boolean) => void;
};

/**
 * Dispatcher cetak: memilih jalur sesuai `print_settings.mode`.
 *
 * - `browser` (default, termasuk baris lama): dialog print OS.
 * - `bluetooth`: thermal ESC/POS via Web Bluetooth (BLE) atau Web Serial
 *   (Classic SPP, Chrome desktop). Bila browser tidak punya keduanya
 *   (Safari/iPad), jatuh ke dialog OS dengan pemberitahuan; layar cetak tidak
 *   boleh berhenti total hanya karena mode tidak didukung.
 */
export function PrintFlow({ photos, plan, printSettings, jobId, reprint = false, onDone }: Props) {
  const mode = resolvePrintMode(printSettings);
  // Printer thermal bisa BLE (Web Bluetooth) atau Classic SPP (Web Serial).
  // Deteksi setelah hidrasi; sebelum itu anggap tersedia agar markup SSR dan
  // client sama (layar cetak sendiri yang menampilkan fallback).
  const transport = usePrintTransport();
  const thermalAvailable = transport.bluetooth || transport.serial;
  // State turunan: jangan setState di effect (memicu render berantai).
  // Sebelum hidrasi `ready=false` → perilaku SSR tetap sama dengan client.
  const [forceBrowser, setForceBrowser] = useState(false);
  if (mode === "cups") {
    return (
      <CupsPrintScreen
        photos={photos}
        plan={plan}
        printSettings={printSettings}
        jobId={jobId}
        reprint={reprint}
        onDone={onDone}
      />
    );
  }
  const useBrowser = mode !== "bluetooth" || forceBrowser || (transport.ready && !thermalAvailable);

  if (!useBrowser) {
    return (
      <BluetoothPrintScreen
        photos={photos}
        plan={plan}
        printSettings={printSettings}
        jobId={jobId}
        reprint={reprint}
        onDone={onDone}
        onUseBrowserPrint={() => setForceBrowser(true)}
      />
    );
  }

  return (
    <PrintLayoutRenderer
      photos={photos}
      plan={plan}
      printSettings={printSettings}
      jobId={jobId}
      reprint={reprint}
      onDone={onDone}
    />
  );
}
