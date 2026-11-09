/**
 * Utilitas warna murni (client + server) — dipakai kiosk untuk menurunkan
 * permukaan kartu dari palet owner dan memilih teks yang tetap terbaca.
 * Tanpa dependensi agar aman di bundle kiosk.
 */

const HEX_RE = /^#([0-9a-fA-F]{6})$/;

/** Parse `#RRGGBB` → [r, g, b] (0–255). null bila bukan hex 6 digit. */
export function parseHex(hex: string | undefined | null): [number, number, number] | null {
  if (!hex) return null;
  const m = HEX_RE.exec(hex.trim());
  if (!m) return null;
  const value = Number.parseInt(m[1]!, 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/** `#RRGGBB` + alpha → `rgba(...)`. Portal kiosk lama (Chromium <111) belum
 *  kenal `color-mix()`, jadi overlay video memakai rgba(). Hex non-6-digit
 *  (mis. var() atau nama warna) dikembalikan apa adanya agar tetap terpakai. */
export function hexToRgba(hex: string, alpha: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

function toHex(rgb: [number, number, number]): string {
  return `#${rgb
    .map((c) =>
      Math.round(Math.min(255, Math.max(0, c)))
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`;
}

export function relativeLuminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Rasio kontras WCAG. Warna tidak valid = 1 (dianggap gagal). */
export function contrastRatio(foreground: string, background: string): number {
  if (!parseHex(foreground) || !parseHex(background)) return 1;
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Campur `overlay` ke `base` sebesar `weight` (0–1) — setara color-mix sRGB. */
export function mixHex(base: string, overlay: string, weight: number): string {
  const a = parseHex(base);
  const b = parseHex(overlay);
  if (!a || !b) return base;
  const w = Math.min(1, Math.max(0, weight));
  return toHex([a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w, a[2] + (b[2] - a[2]) * w]);
}

const AA = 4.5;

/**
 * Pilih warna teks yang terbaca di atas `background`: pakai `preferred` bila
 * lolos AA, lalu kandidat cadangan, terakhir hitam/putih mana yang lebih baik.
 */
export function readableText(
  background: string,
  preferred: string,
  fallbacks: string[] = []
): string {
  const candidates = [preferred, ...fallbacks, "#111111", "#ffffff"];
  for (const candidate of candidates) {
    if (contrastRatio(candidate, background) >= AA) return candidate;
  }
  return contrastRatio("#111111", background) >= contrastRatio("#ffffff", background)
    ? "#111111"
    : "#ffffff";
}

/**
 * Permukaan kartu di dalam layar kiosk. Kartu putih paksa memutus palet owner
 * dan bisa membuat teks kustom hilang; turunan `bg` menjaga keduanya.
 */
export function cardSurface(bg: string, text: string): string {
  return mixHex(bg, text, 0.06);
}

/**
 * Teks sekunder (hint, label, keterangan) di atas `bg`. Token statis
 * `--muted-foreground` (#555) hanya lolos AA di latar terang; di palet gelap
 * milik owner ia jatuh di bawah 3:1. Turunkan dari `text` lalu mundur ke `text`
 * penuh bila campurannya tidak lolos AA.
 */
export function mutedText(bg: string, text: string): string {
  const muted = mixHex(text, bg, 0.3);
  return contrastRatio(muted, bg) >= AA ? muted : text;
}

/** Latar blok sekunder (chip, panel redup) — sedikit lebih terang dari `bg`. */
export function mutedSurface(bg: string, text: string): string {
  return mixHex(bg, text, 0.12);
}

/**
 * Warna brand owner yang aman dipakai sebagai teks/latar: bila rasio kontras
 * terhadap pasangannya < 4.5:1, pakai default SnapyOS. Dipakai kiosk agar
 * kombinasi warna owner yang buruk tidak membuat layar tak terbaca.
 */
export function safeBrandColor(
  value: string | null | undefined,
  against: string | null | undefined,
  fallback: string
): string {
  if (!value || !against) return value || fallback;
  if (!parseHex(value) || !parseHex(against)) return value || fallback;
  return contrastRatio(value, against) >= AA ? value : fallback;
}
