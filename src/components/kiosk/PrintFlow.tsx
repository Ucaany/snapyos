"use client";

import { useState } from "react";
import { PrintLayoutRenderer } from "@/components/kiosk/PrintLayoutRenderer";
import { BluetoothPrintScreen } from "@/components/kiosk/BluetoothPrintScreen";
import { isBluetoothPrintSupported } from "@/lib/print/bluetooth";
import { resolvePrintMode, type PrintModeInput } from "@/lib/print/print-mode";
import type { PrintPlan } from "@/lib/print-layout";

type Props = {
  photos: { blob: Blob }[];
  plan: PrintPlan;
  printSettings?: PrintModeInput | null;
  /** success=true → permintaan cetak terkirim (browser tidak memberi status fisik). */
  onDone: (success: boolean) => void;
};

/**
 * Dispatcher cetak: memilih jalur sesuai `print_settings.mode`.
 *
 * - `browser` (default, termasuk baris lama): dialog print OS.
 * - `bluetooth`: thermal ESC/POS via Web Bluetooth. Bila browser tidak punya
 *   Web Bluetooth (Safari/iPad), jatuh ke dialog OS dengan pemberitahuan,
 *   layar cetak tidak boleh berhenti total hanya karena mode tidak didukung.
 */
export function PrintFlow({ photos, plan, printSettings, onDone }: Props) {
  const mode = resolvePrintMode(printSettings);
  const btAvailable = typeof navigator !== "undefined" && isBluetoothPrintSupported();
  const [useBrowser, setUseBrowser] = useState(mode !== "bluetooth" || !btAvailable);

  if (!useBrowser) {
    return (
      <BluetoothPrintScreen
        photos={photos}
        plan={plan}
        printSettings={printSettings}
        onDone={onDone}
        onUseBrowserPrint={() => setUseBrowser(true)}
      />
    );
  }

  return (
    <PrintLayoutRenderer
      photos={photos}
      plan={plan}
      printSettings={printSettings}
      onDone={onDone}
    />
  );
}
