/**
 * Pemilihan jalur cetak, PURE.
 *
 * `mode` tidak ada di baris lama (sebelum fitur Bluetooth), jadi default harus
 * `browser`; jangan pernah menebak bluetooth hanya karena field lain kosong.
 */

import type { PrintSettingsInput } from "@/lib/print-layout";

export type PrintMode = "browser" | "bluetooth";

/** Lebar kertas thermal dalam dot (203 dpi = 8 dot/mm). */
export const THERMAL_WIDTH_DOTS = { 58: 384, 80: 576 } as const;

export type ThermalPaperWidth = keyof typeof THERMAL_WIDTH_DOTS;

export type PrintModeInput = PrintSettingsInput & {
  mode?: string | null;
  bluetooth_paper_width_mm?: number | null;
  bluetooth_device_name?: string | null;
};

export function resolvePrintMode(settings?: PrintModeInput | null): PrintMode {
  return settings?.mode === "bluetooth" ? "bluetooth" : "browser";
}

/** Lebar dot untuk mode thermal; 80mm default (paling umum di booth foto). */
export function bluetoothWidthDots(settings?: PrintModeInput | null): 384 | 576 {
  return settings?.bluetooth_paper_width_mm === 58 ? 384 : 576;
}
