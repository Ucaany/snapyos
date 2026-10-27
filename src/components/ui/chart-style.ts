"use client";

import { useIsModernTheme } from "@/components/theme/dashboard-theme-context";

/**
 * Gaya chart per tema. Brutalis = nilai yang sudah dipakai sekarang
 * (garis hitam 2px, bar kotak, font mono). Modern = default shadcn charts
 * (grid `--border`, sumbu tanpa garis tebal, bar membulat, font sans).
 *
 * Chart tetap komponen Recharts yang sama; hanya angka/string gaya yang beda,
 * karena prop `strokeWidth`/`radius` recharts menerima nilai, bukan kelas CSS.
 */
export function useChartStyle() {
  const modern = useIsModernTheme();
  return modern
    ? {
        gridStroke: "var(--border)",
        gridOpacity: 1,
        axisLine: false as const,
        barStroke: "none",
        barStrokeWidth: 0,
        barRadius: 4,
        tickFontFamily: "var(--font-sans)",
        cursorFill: "var(--muted)",
        cursorOpacity: 0.6,
      }
    : {
        gridStroke: "#111111",
        gridOpacity: 0.15,
        axisLine: { stroke: "#111111", strokeWidth: 2 } as const,
        barStroke: "#111111",
        barStrokeWidth: 2,
        barRadius: 0,
        tickFontFamily: "var(--font-mono)",
        cursorFill: "#111111",
        cursorOpacity: 0.06,
      };
}
