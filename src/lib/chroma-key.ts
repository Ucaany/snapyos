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

/**
 * Hapus piksel berwarna kunci dengan tepi lembut. Mengubah alpha saja, jadi
 * komposit di atas frame transparan tidak meninggalkan halo.
 *
 * @returns jumlah piksel yang diubah (untuk diagnostik/UI)
 */
export function applyChromaKey(
  rgba: Uint8ClampedArray,
  options: ChromaKeyOptions = DEFAULT_CHROMA_KEY
): number {
  const { key, tolerance } = options;
  const softness = Math.min(1, Math.max(0, options.softness ?? 0.25));
  const inner = tolerance * (1 - softness);
  let changed = 0;
  for (let p = 0; p < rgba.length; p += 4) {
    const distance = colorDistance([rgba[p]!, rgba[p + 1]!, rgba[p + 2]!], key);
    if (distance <= inner) {
      rgba[p + 3] = 0;
      changed += 1;
    } else if (distance < tolerance) {
      // Tepi: turunkan alpha secara proporsional agar tidak bergerigi.
      const ratio = (distance - inner) / Math.max(1, tolerance - inner);
      rgba[p + 3] = Math.round((rgba[p + 3] ?? 255) * ratio);
      changed += 1;
    }
  }
  return changed;
}
