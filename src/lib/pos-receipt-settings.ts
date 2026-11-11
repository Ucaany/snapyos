/**
 * Setelan cetak struk POS, PURE.
 *
 * Satu sumber pemetaan `photoboxes.print_settings` → lebar kertas dan jalur
 * cetak. Server memakainya saat memuat order; UI memakainya untuk memutuskan
 * auto-print tanpa menebak dari field yang kosong.
 *
 * Sumber utama `print_settings.receipt`; field datar lama (`mode`,
 * `bluetooth_paper_width_mm`, `auto_print`) jadi fallback baris pra-fitur.
 */

export type PosPrintMode = "browser" | "bluetooth" | "cups";

export type PosPrintSettingsInput = {
  enabled?: boolean | null;
  mode?: string | null;
  bluetooth_paper_width_mm?: number | null;
  auto_print?: boolean | null;
  /** Bridge CUPS lokal (dipakai struk mode `cups`). */
  bridge_url?: string | null;
  printer_name?: string | null;
  receipt?: {
    enabled?: boolean | null;
    mode?: string | null;
    paper_width_mm?: number | null;
    auto_print?: boolean | null;
    bridge_url?: string | null;
    printer_name?: string | null;
  } | null;
} | null;

export type PosReceiptSettings = {
  /** 58/80mm untuk thermal; null bila order tidak terikat booth. */
  paperWidthMm: 58 | 80 | null;
  printMode: PosPrintMode;
  autoPrint: boolean;
  /** Printer CUPS tujuan struk; null = printer default OS/bridge. */
  printerName: string | null;
  /** URL bridge CUPS; null = default bridge (http://127.0.0.1:17777). */
  bridgeUrl: string | null;
};

const POS_PRINT_MODES: readonly PosPrintMode[] = ["browser", "bluetooth", "cups"];

/** Mode tak dikenal → `browser`: struk tidak boleh diam-diam pindah ke thermal. */
function resolveMode(...candidates: Array<string | null | undefined>): PosPrintMode {
  for (const candidate of candidates) {
    if (
      typeof candidate === "string" &&
      (POS_PRINT_MODES as readonly string[]).includes(candidate)
    ) {
      return candidate as PosPrintMode;
    }
  }
  return "browser";
}

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed === "" ? null : trimmed;
}

export function resolvePosReceiptSettings(
  settings: PosPrintSettingsInput,
  hasBooth = true
): PosReceiptSettings {
  const receipt = settings?.receipt;
  const width = receipt?.paper_width_mm ?? settings?.bluetooth_paper_width_mm;
  return {
    paperWidthMm: hasBooth ? (width === 58 ? 58 : 80) : null,
    printMode: resolveMode(receipt?.mode, settings?.mode),
    // Backward compatible: baris lama tanpa auto_print tetap auto-print.
    autoPrint: (receipt?.auto_print ?? settings?.auto_print) !== false,
    printerName: nonEmpty(receipt?.printer_name ?? settings?.printer_name),
    bridgeUrl: nonEmpty(receipt?.bridge_url ?? settings?.bridge_url),
  };
}

/** `receipt.enabled`/`print_settings.enabled` = false → struk disembunyikan. */
export function isPosReceiptEnabled(settings: PosPrintSettingsInput): boolean {
  return settings?.enabled !== false && settings?.receipt?.enabled !== false;
}

/**
 * Auto-print hanya untuk jalur thermal (ESC/POS) dan bila owner tidak
 * mematikannya. CUPS dikirim lewat tombol struk, bukan auto selamanya.
 */
export function shouldAutoPrintReceipt(order: {
  print_mode: PosPrintMode;
  auto_print: boolean;
}): boolean {
  return order.print_mode === "bluetooth" && order.auto_print;
}
