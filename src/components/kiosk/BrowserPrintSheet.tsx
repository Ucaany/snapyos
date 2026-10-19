"use client";

/**
 * Alias jalur cetak browser (dialog OS). Implementasi tetap satu:
 * `PrintLayoutRenderer` (window.print + @page). Nama ini dipakai `PrintFlow`
 * supaya maksud transport terbaca di call-site.
 */

export { PrintLayoutRenderer as BrowserPrintSheet } from "./PrintLayoutRenderer";
