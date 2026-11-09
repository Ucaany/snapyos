/**
 * Predikat warna hijau layar kroma — PURE, tanpa DOM.
 *
 * Dipakai dua jalur yang HARUS konsisten:
 * - `src/lib/frame-chroma.ts` (deteksi area hijau frame → slot mask)
 * - `src/server/template-chroma.ts` (hapus piksel hijau dari file frame)
 *
 * Satu predikat = lubang di file frame selalu sama dengan bentuk slot.
 */

/** Hue (derajat 0..360), saturasi HSL (0..1), dan value HSV (0..1). */
function hslParts(r: number, g: number, b: number): { hue: number; sat: number; value: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let hue = 0;
  if (delta > 0) {
    if (max === rn) hue = ((gn - bn) / delta) % 6;
    else if (max === gn) hue = (bn - rn) / delta + 2;
    else hue = (rn - gn) / delta + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  const light = (max + min) / 2;
  const denom = 1 - Math.abs(2 * light - 1);
  const sat = denom === 0 ? 0 : delta / denom;
  return { hue, sat, value: max };
}

/**
 * Apakah warna ini masuk akal sebagai layar hijau? Menolak latar biru/abu
 * agar piksel foto biasa tidak ikut dianggap slot.
 */
export function isGreenBackground(rgb: [number, number, number]): boolean {
  const [r, g, b] = rgb;
  if (g > r * 1.15 && g > b * 1.15 && g >= 60) return true;
  const { hue, sat, value } = hslParts(r, g, b);
  return hue >= 90 && hue <= 160 && sat >= 0.25 && value >= 0.15;
}
