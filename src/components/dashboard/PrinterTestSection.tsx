"use client";

import { useState } from "react";
import { PrintTestPanel } from "@/components/print/PrintTestPanel";
import { reportPrintTestAction } from "@/server/booth-actions";
import { resolvePrintMode, type PrintModeInput } from "@/lib/print/print-mode";
import type { PrintSettings } from "@/lib/kiosk-types";

type Props = {
  photoboxId: string;
  photoboxName: string;
  printSettings: PrintSettings;
  deviceStatus: Record<string, unknown> | null;
  canWrite: boolean;
};

/** Panel uji cetak owner, dibungkus server action + status tersimpan. */
export function PrinterTestSection({
  photoboxId,
  photoboxName,
  printSettings,
  deviceStatus,
  canWrite,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const printer = (deviceStatus?.printer as Record<string, unknown> | null) ?? null;
  const mode = resolvePrintMode(printSettings as PrintModeInput);

  return (
    <div className="flex flex-col gap-3">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
        {"PRINTER · " + photoboxName.toUpperCase()}
      </p>
      {error && (
        <p
          role="alert"
          className="border-2 border-destructive bg-destructive/10 px-3 py-2 font-mono text-xs text-ink"
        >
          {error}
        </p>
      )}
      <PrintTestPanel
        mode={mode}
        paperWidthMm={printSettings.bluetooth_paper_width_mm === 58 ? 58 : 80}
        sample={{
          title: "HALAMAN UJI",
          lines: [photoboxName, mode === "bluetooth" ? "THERMAL ESC/POS" : "DIALOG SISTEM"],
        }}
        lastTest={
          printer
            ? {
                confirmed: Boolean(printer.confirmed),
                last_test_at:
                  typeof printer.last_test_at === "string" ? printer.last_test_at : undefined,
                mode: typeof printer.mode === "string" ? printer.mode : undefined,
                device_name:
                  typeof printer.device_name === "string" ? printer.device_name : undefined,
              }
            : null
        }
        canReport={canWrite}
        onReport={async (result) => {
          setError(null);
          const response = await reportPrintTestAction(photoboxId, result);
          if (!response.ok) setError(response.error ?? "Gagal menyimpan hasil uji cetak.");
        }}
      />
      {!canWrite && (
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          READ-ONLY, peran ini tidak boleh mengubah status printer.
        </p>
      )}
    </div>
  );
}
