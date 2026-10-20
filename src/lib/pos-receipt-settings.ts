/**
 * Setelan cetak struk POS, PURE.
 *
 * Satu sumber pemetaan `photoboxes.print_settings` → lebar kertas dan jalur
 * cetak. Server memakainya saat memuat order; UI memakainya untuk memutuskan
 * auto-print tanpa menebak dari field yang kosong.
 */

export type PosPrintSettingsInput = {
  mode?: string | null;
  bluetooth_paper_width_mm?: number | null;
  auto_print?: boolean | null;
} | null;

export type PosReceiptSettings = {
  /** 58/80mm untuk thermal; null bila order tidak terikat booth. */
  paperWidthMm: 58 | 80 | null;
  printMode: "browser" | "bluetooth";
  autoPrint: boolean;
};

export function resolvePosReceiptSettings(
  settings: PosPrintSettingsInput,
  hasBooth = true
): PosReceiptSettings {
  return {
    paperWidthMm: hasBooth ? (settings?.bluetooth_paper_width_mm === 58 ? 58 : 80) : null,
    printMode: settings?.mode === "bluetooth" ? "bluetooth" : "browser",
    // Backward compatible: baris lama tanpa auto_print tetap auto-print.
    autoPrint: settings?.auto_print !== false,
  };
}

/** Auto-print hanya untuk jalur thermal dan bila owner tidak mematikannya. */
export function shouldAutoPrintReceipt(order: {
  print_mode: "browser" | "bluetooth";
  auto_print: boolean;
}): boolean {
  return order.print_mode === "bluetooth" && order.auto_print;
}
