/**
 * Pemilihan jalur cetak, PURE.
 *
 * `mode` tidak ada di baris lama (sebelum fitur Bluetooth), jadi default harus
 * `browser`; jangan pernah menebak bluetooth hanya karena field lain kosong.
 *
 * Tiga jalur (docs/05 §5.15): `photo` (printer foto: dialog OS / CUPS), `thermal`
 * (foto 1-bit ESC/POS), `receipt` (struk POS). Grup menang; field datar lama
 * adalah fallback supaya baris pra-fitur tetap jalan.
 */

import type { PrintSettingsInput } from "@/lib/print-layout";

export type PrintMode = "browser" | "bluetooth" | "cups";

/** Jalur cetak yang bisa dipilih. Struk POS tetap dicetak lewat `ReceiptView`. */
export type PrintPurpose = "photo" | "thermal" | "receipt";

/** Lebar kertas thermal dalam dot (203 dpi = 8 dot/mm). */
export const THERMAL_WIDTH_DOTS = { 58: 384, 80: 576 } as const;

export type ThermalPaperWidth = keyof typeof THERMAL_WIDTH_DOTS;

/**
 * Satu grup jalur cetak. Field-nya superset dari ketiga grup supaya pembaca
 * cukup satu tipe; yang tidak relevan untuk satu jalur memang tidak ditulis.
 */
export type PrintPathGroup = {
  enabled?: boolean;
  mode?: PrintMode | null;
  printer_name?: string | null;
  paper_size?: PrintSettingsInput["paper_size"];
  orientation?: PrintSettingsInput["orientation"];
  fit?: PrintSettingsInput["fit"];
  margins_mm?: number | null;
  media_name?: string | null;
  strip_2up?: boolean | null;
  auto_print?: boolean | null;
  bridge_url?: string | null;
  paper_width_mm?: number | null;
  bluetooth_device_name?: string | null;
};

export type PrintModeInput = PrintSettingsInput & {
  /** Sakelar induk cetak (kiosk lama). false = tidak ada jalur cetak. */
  enabled?: boolean | null;
  mode?: string | null;
  bluetooth_paper_width_mm?: number | null;
  bluetooth_device_name?: string | null;
  photo?: PrintPathGroup | null;
  thermal?: PrintPathGroup | null;
  receipt?: PrintPathGroup | null;
};

/** Grup setelan untuk satu jalur (`thermal` tidak menyimpan `mode`). */
export function printPathGroup(
  settings: PrintModeInput | null | undefined,
  purpose: PrintPurpose
): PrintPathGroup | null | undefined {
  if (!settings) return null;
  if (purpose === "photo") return settings.photo;
  if (purpose === "receipt") return settings.receipt;
  return settings.thermal;
}

export function resolvePrintMode(
  settings?: PrintModeInput | null,
  purpose: PrintPurpose = "photo"
): PrintMode {
  // Foto ke printer thermal selalu jalur ESC/POS, bukan pilihan dialog OS.
  if (purpose === "thermal") return "bluetooth";
  const group = printPathGroup(settings, purpose);
  const mode = group?.mode ?? settings?.mode;
  if (mode === "bluetooth") return "bluetooth";
  if (mode === "cups") return "cups";
  return "browser";
}

/**
 * Apakah jalur ini boleh ditawarkan ke customer.
 *
 * `enabled` tingkat atas adalah sakelar induk (kiosk lama memakainya). Grup
 * `photo` hanya menang bila memang ada — baris lama tanpa grup tetap memakai
 * field datar: `mode` bukan bluetooth berarti jalur foto, `bluetooth` berarti
 * jalur thermal. Tanpa fallback ini booth lama tiba-tiba menampilkan pemilih
 * dua jalur padahal hanya punya satu printer.
 */
export function isPrintPathEnabled(
  settings: PrintModeInput | null | undefined,
  purpose: PrintPurpose
): boolean {
  if (settings?.enabled === false) return false;
  if (purpose === "receipt") return settings?.receipt?.enabled !== false;
  if (purpose === "photo") {
    if (settings?.photo) return settings.photo.enabled !== false;
    return settings?.mode !== "bluetooth";
  }
  if (typeof settings?.thermal?.enabled === "boolean") return settings.thermal.enabled;
  return settings?.mode === "bluetooth";
}

/**
 * Setelan datar efektif untuk satu jalur — grup menimpa field datar, field
 * yang tidak ada di grup jatuh ke nilai lama. Renderer tetap menerima bentuk
 * datar (`PrintSettingsInput`) supaya geometri/auto-print tidak perlu tahu grup.
 */
export function resolvePurposeSettings(
  settings: PrintModeInput | null | undefined,
  purpose: PrintPurpose
): PrintModeInput {
  if (!settings) return {};
  if (purpose === "photo") {
    const group = settings.photo;
    if (!group) return settings;
    return {
      ...settings,
      mode: group.mode ?? settings.mode ?? null,
      printer_name: group.printer_name ?? settings.printer_name,
      paper_size: group.paper_size ?? settings.paper_size,
      orientation: group.orientation ?? settings.orientation,
      fit: group.fit ?? settings.fit,
      margins_mm: group.margins_mm ?? settings.margins_mm,
      media_name: group.media_name ?? settings.media_name,
      strip_2up: group.strip_2up ?? settings.strip_2up,
      auto_print: group.auto_print ?? settings.auto_print,
      bridge_url: group.bridge_url ?? settings.bridge_url,
    };
  }
  if (purpose === "receipt") {
    const group = settings.receipt;
    if (!group) return settings;
    return {
      ...settings,
      mode: group.mode ?? settings.mode ?? null,
      printer_name: group.printer_name ?? settings.printer_name,
      auto_print: group.auto_print ?? settings.auto_print,
      bluetooth_paper_width_mm: normalizeWidth(
        group.paper_width_mm ?? settings.bluetooth_paper_width_mm
      ),
    };
  }
  const group = settings.thermal;
  if (!group) return settings;
  return {
    ...settings,
    mode: "bluetooth",
    printer_name: group.printer_name ?? settings.printer_name,
    auto_print: group.auto_print ?? settings.auto_print,
    bluetooth_paper_width_mm: normalizeWidth(
      group.paper_width_mm ?? settings.bluetooth_paper_width_mm
    ),
    bluetooth_device_name: group.bluetooth_device_name ?? settings.bluetooth_device_name ?? null,
  };
}

/**
 * Jalur yang ditawarkan untuk HASIL FOTO (urutan tetap: foto dulu).
 *
 * Transport perangkat TIDAK disaring di sini: `BluetoothPrintScreen` sudah
 * punya layar "Bluetooth tidak tersedia" dengan tombol dialog OS eksplisit,
 * jadi booth lama tetap bisa mencetak — dengan pemberitahuan, bukan diam-diam.
 */
export function availablePrintPaths(
  settings: PrintModeInput | null | undefined
): Array<"photo" | "thermal"> {
  const paths: Array<"photo" | "thermal"> = [];
  if (isPrintPathEnabled(settings, "photo")) paths.push("photo");
  if (isPrintPathEnabled(settings, "thermal")) paths.push("thermal");
  return paths;
}

/** Lebar kertas hanya 58/80; nilai lain (baris lama) jadi null = default 80. */
function normalizeWidth(value: number | null | undefined): 58 | 80 | null {
  return value === 58 || value === 80 ? value : null;
}

/** Lebar dot untuk mode thermal; 80mm default (paling umum di booth foto). */
export function bluetoothWidthDots(settings?: PrintModeInput | null): 384 | 576 {
  const width = settings?.thermal?.paper_width_mm ?? settings?.bluetooth_paper_width_mm;
  return width === 58 ? 384 : 576;
}
