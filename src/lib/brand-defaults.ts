/**
 * Brand color defaults (fallback values when business branding is absent).
 * Mirrors tokens.css --color-* values for runtime fallback scenarios.
 */
export const defaultBrandColors = {
  accent: "#ffd400",
  ink: "#111111",
  bg: "#fffdf5",
  destructive: "#c81e1e",
  muted: "#eae8e3",
} as const;

/**
 * Slot palette for TemplateBuilder (photo frame slot colors).
 * Mirrors tokens.css --color-slot-* values.
 */
export const slotColors = [
  "#ffd400", // slot-1 (kuning — mirror accent)
  "#38d9a9", // slot-2 (hijau)
  "#ff5c8a", // slot-3 (pink)
  "#4d6bff", // slot-4 (biru)
  "#ff8a3d", // slot-5 (oranye)
  "#9b8cff", // slot-6 (ungu muda)
  "#5ce1e6", // slot-7 (cyan)
  "#f28ca6", // slot-8 (merah muda)
] as const;
