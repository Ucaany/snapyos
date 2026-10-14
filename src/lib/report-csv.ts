/**
 * CSV/XLSX export murni — docs/04 §4.16 (CSV server-side; PDF future).
 * Dipisah dari server module agar bisa di-unit-test tanpa Supabase.
 */

/** Escape satu sel CSV: quote bila ada , " \n atau ; + gandakan quote. */
export function csvCell(value: string | number | null | undefined): string {
  const rawValue = value === null || value === undefined ? "" : String(value);
  const raw = /^[=+\-@\t\r]/.test(rawValue) ? `'${rawValue}` : rawValue;
  if (/[",\n\r;]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

/** Baris CSV standar RFC 4180 (CRLF) + BOM Excel saat dikirim sebagai file. */
export function toCSV(headers: string[], rows: (string | number | null)[][]): string {
  const lines = [headers.map(csvCell).join(";"), ...rows.map((r) => r.map(csvCell).join(";"))];
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}

export type ReportTable = {
  headers: string[];
  rows: (string | number | null)[][];
};

/** Nama file report: snapyos-{type}-{from}-{to}.{ext}. */
export function reportFilename(type: string, from: string, to: string, ext: string): string {
  return `snapyos-${type}-${from}-${to}.${ext}`;
}
