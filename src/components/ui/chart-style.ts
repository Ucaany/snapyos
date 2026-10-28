/**
 * Gaya chart tunggal (Neo-Brutalism): garis ink 2px, bar kotak radius 0,
 * label mono. Dipakai semua chart Recharts lewat prop angka/string, karena
 * `strokeWidth`/`radius` Recharts menerima nilai, bukan kelas CSS.
 */
export const CHART_STYLE = {
  gridStroke: "#111111",
  gridOpacity: 0.15,
  axisLine: { stroke: "#111111", strokeWidth: 2 } as const,
  barStroke: "#111111",
  barStrokeWidth: 2,
  barRadius: 0,
  tickFontFamily: "var(--font-mono)",
  cursorFill: "#111111",
  cursorOpacity: 0.06,
} as const;
