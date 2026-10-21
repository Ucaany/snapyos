/**
 * Print layout mapping — docs/05 §5.15.3 (print_count → lembar/strip).
 * Murni agar bisa di-unit-test. print layout final ditentukan
 * print_settings.layout + package.print_count (docs/05 §5.15.3).
 */

export type PrintSettingsInput = {
  paper_size?: "4x6" | "A6" | null;
  orientation?: "portrait" | "landscape" | null;
  auto_print?: boolean;
  copies?: number | null;
  margins_mm?: number | null;
  /** Jalur cetak (baris lama tanpa `mode` = browser). */
  mode?: "browser" | "bluetooth" | "cups" | null;
  /** Lebar kertas thermal (58/80mm). */
  bluetooth_paper_width_mm?: 58 | 80 | null;
  /** Nama printer Bluetooth (informasi untuk petugas). */
  bluetooth_device_name?: string | null;
  /** URL bridge CUPS lokal, default http://127.0.0.1:17777. */
  bridge_url?: string | null;
  /** Nama printer CUPS; kosong = printer default OS. */
  printer_name?: string | null;
};

export type PrintPageSize = { widthMm: number; heightMm: number; marginMm: number };

/**
 * Margin cetak default (mm) — satu-satunya sumber default geometry.
 * Dipakai CSS fallback (globals.css @page/--print-margin) dan
 * PrintLayoutRenderer saat owner tidak menyetel margin. Jaga sinkron.
 */
export const PRINT_DEFAULT_MARGIN_MM = 0;

export type PrintPlan =
  | { kind: "digital"; sheets: 0 }
  | { kind: "strip"; sheets: number; photosPerStrip: number }
  | { kind: "single"; sheets: number; photoIndexes: number[] };

/** Ukuran kertas foto → mm. 4x6 = 101.6×152.4; A6 = 105×148. Orientasi swap w/h. */
export function printPageSize(settings?: PrintSettingsInput | null): PrintPageSize {
  const base = settings?.paper_size === "A6" ? { w: 105, h: 148 } : { w: 101.6, h: 152.4 };
  const landscape = settings?.orientation === "landscape";
  const marginRaw = typeof settings?.margins_mm === "number" ? settings.margins_mm : 0;
  const marginMm = Math.min(20, Math.max(0, marginRaw));
  return {
    widthMm: landscape ? Math.max(base.w, base.h) : Math.min(base.w, base.h),
    heightMm: landscape ? Math.min(base.w, base.h) : Math.max(base.w, base.h),
    marginMm,
  };
}

/** Tinggi area konten setelah margin @page diterapkan. */
export function printContentHeightMm(page: PrintPageSize): number {
  return Math.max(1, page.heightMm - page.marginMm * 2);
}

/** Salinan cetak 1–20; di luar itu clamp ke 1 (data lama aman). */
export function printCopies(settings?: PrintSettingsInput | null): number {
  const c = settings?.copies;
  if (typeof c !== "number" || !Number.isInteger(c)) return 1;
  return Math.min(20, Math.max(1, c));
}

/** Auto-print aktif bila tidak eksplisit false (backward compatible). */
export function shouldAutoPrint(settings?: PrintSettingsInput | null): boolean {
  return settings?.auto_print !== false;
}

/**
 * - print_count 0        → digital only (download/QR)
 * - photostrip / layout strip → N foto disusun 1 strip; print_count = jumlah lembar (copy strip)
 * - single               → tiap lembar cetak satu foto (urutan siklik bila print_count > foto)
 */
export function printPlan(
  printCount: number,
  photoCount: number,
  captureMode: string,
  layout?: string | null
): PrintPlan {
  const prints = Number.isInteger(printCount) ? Math.max(0, printCount) : 0;
  if (prints === 0) return { kind: "digital", sheets: 0 };

  if (!Number.isInteger(photoCount) || photoCount <= 0) return { kind: "digital", sheets: 0 };
  const photos = photoCount;
  const isStrip = (layout ?? "") === "strip" || captureMode === "photostrip";
  if (isStrip) return { kind: "strip", sheets: prints, photosPerStrip: photos };

  const photoIndexes: number[] = [];
  for (let s = 0; s < prints; s++) photoIndexes.push(s % photos);
  return { kind: "single", sheets: prints, photoIndexes };
}

/**
 * Pemetaan lembar → indeks foto, dipakai BERSAMA oleh jalur browser
 * (`PrintLayoutRenderer`) dan jalur thermal (`BluetoothPrintScreen`).
 *
 * `copies` menggandakan set lembar (bukan menambah foto), dan `single`
 * menggilir foto bila print_count > jumlah foto.
 */
export function printSheets(plan: PrintPlan, photoCount: number, copies: number): number[][] {
  if (plan.kind === "digital") return [];
  const photos = Math.max(0, Math.floor(photoCount));
  if (photos === 0) return [];
  const base =
    plan.kind === "strip"
      ? Array.from({ length: plan.sheets }, () =>
          Array.from({ length: Math.min(plan.photosPerStrip, photos) }, (_, i) => i)
        )
      : plan.photoIndexes.map((idx) => [idx % photos]);
  const repeat = Math.min(20, Math.max(1, Math.floor(copies) || 1));
  return Array.from({ length: repeat }, () => base).flat();
}
