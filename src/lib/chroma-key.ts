/**
 * Chroma key, menghapus latar hijau dari foto booth agar frame PNG
 * transparan bisa menampilkan latar desain di belakang customer.
 *
 * Pure: bekerja pada buffer RGBA, tanpa DOM, sehingga bisa diuji langsung.
 * Dipakai `photo-render.ts` sebelum foto digambar ke canvas.
 */

export type ChromaKeyOptions = {
  /** Warna kunci RGB 0..255. Default hijau kroma (#00b140). */
  key: [number, number, number];
  /** Toleransi jarak warna (0..441). 90 = cukup longgar untuk bayangan. */
  tolerance: number;
  /** Kelembutan tepi (0..1), mengurangi garis hijau di tepi rambut. */
  softness?: number;
};

export const DEFAULT_CHROMA_KEY: ChromaKeyOptions = {
  key: [0, 177, 64],
  tolerance: 90,
  softness: 0.25,
};

/** Jarak Euclidean RGB. */
export function colorDistance(a: [number, number, number], b: [number, number, number]): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/** Perkiraan warna latar dari sudut gambar (piksel paling sering muncul). */
export function sampleCornerColor(
  rgba: Uint8ClampedArray,
  width: number,
  height: number
): [number, number, number] {
  const points: [number, number][] = [
    [0, 0],
    [Math.max(0, width - 1), 0],
    [0, Math.max(0, height - 1)],
    [Math.max(0, width - 1), Math.max(0, height - 1)],
  ];
  const sums = [0, 0, 0];
  for (const [x, y] of points) {
    const p = (y * width + x) * 4;
    sums[0]! += rgba[p] ?? 0;
    sums[1]! += rgba[p + 1] ?? 0;
    sums[2]! += rgba[p + 2] ?? 0;
  }
  return [
    Math.round(sums[0]! / points.length),
    Math.round(sums[1]! / points.length),
    Math.round(sums[2]! / points.length),
  ];
}

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
 * agar chroma key tidak menghapus foto biasa.
 */
export function isGreenBackground(rgb: [number, number, number]): boolean {
  const [r, g, b] = rgb;
  if (g > r * 1.15 && g > b * 1.15 && g >= 60) return true;
  const { hue, sat, value } = hslParts(r, g, b);
  return hue >= 90 && hue <= 160 && sat >= 0.25 && value >= 0.15;
}

/**
 * Hapus piksel berwarna kunci dengan tepi lembut. Mengubah alpha saja, jadi
 * komposit di atas frame transparan tidak meninggalkan halo.
 *
 * `size` (opsional) mengaktifkan gerbang latar: bila sudut foto bukan hijau,
 * fungsi tidak menyentuh buffer sama sekali. Tanpa `size`, gerbang memakai
 * `options.key` itu sendiri.
 *
 * @returns jumlah piksel yang diubah (untuk diagnostik/UI)
 */
export function applyChromaKey(
  rgba: Uint8ClampedArray,
  options: ChromaKeyOptions = DEFAULT_CHROMA_KEY,
  size?: { width: number; height: number }
): number {
  const { key, tolerance } = options;

  const background = size ? sampleCornerColor(rgba, size.width, size.height) : key;
  if (!isGreenBackground(background)) return 0;

  const softness = Math.min(1, Math.max(0, options.softness ?? 0.25));
  const inner = tolerance * (1 - softness);
  const span = Math.max(1, tolerance - inner);
  let changed = 0;
  for (let p = 0; p < rgba.length; p += 4) {
    const r = rgba[p]!;
    const g = rgba[p + 1]!;
    const b = rgba[p + 2]!;
    const distance = colorDistance([r, g, b], key);
    if (distance <= inner) {
      rgba[p + 3] = 0;
      changed += 1;
    } else if (distance < tolerance) {
      // Tepi: turunkan alpha secara proporsional agar tidak bergerigi.
      const ratio = (distance - inner) / span;
      rgba[p + 3] = Math.round((rgba[p + 3] ?? 255) * ratio);
      // Suppress spill hijau: paksa green turun ke level max(red, blue).
      const cap = Math.max(r, b);
      if (g > cap) rgba[p + 1] = cap;
      changed += 1;
    }
  }
  return changed;
}
