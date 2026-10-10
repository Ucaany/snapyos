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
};

export type PrintPageSize = { widthMm: number; heightMm: number; marginMm: number };

/**
 * Margin cetak default (mm) — satu-satunya sumber default geometry.
 * Dipakai CSS fallback (globals.css @page/--print-margin) dan
 * PrintLayoutRenderer saat owner tidak menyetel margin. Jaga sinkron.
 */
export const PRINT_DEFAULT_MARGIN_MM = 8;

export type PrintPlan =
  | { kind: "digital"; sheets: 0 }
  | { kind: "strip"; sheets: number; photosPerStrip: number }
  | { kind: "single"; sheets: number; photoIndexes: number[] };

/** Ukuran kertas foto → mm. 4x6 = 101.6×152.4; A6 = 105×148. Orientasi swap w/h. */
export function printPageSize(settings?: PrintSettingsInput | null): PrintPageSize {
  const base =
    settings?.paper_size === "A6" ? { w: 105, h: 148 } : { w: 101.6, h: 152.4 };
  const landscape = settings?.orientation === "landscape";
  const marginRaw = typeof settings?.margins_mm === "number" ? settings.margins_mm : 0;
  const marginMm = Math.min(20, Math.max(0, marginRaw));
  return {
    widthMm: landscape ? Math.max(base.w, base.h) : Math.min(base.w, base.h),
    heightMm: landscape ? Math.min(base.w, base.h) : Math.max(base.w, base.h),
    marginMm,
  };
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

  const photos = Number.isInteger(photoCount) ? Math.max(1, photoCount) : 1;
  const isStrip = (layout ?? "") === "strip" || captureMode === "photostrip";
  if (isStrip) return { kind: "strip", sheets: prints, photosPerStrip: photos };

  const photoIndexes: number[] = [];
  for (let s = 0; s < prints; s++) photoIndexes.push(s % photos);
  return { kind: "single", sheets: prints, photoIndexes };
}
