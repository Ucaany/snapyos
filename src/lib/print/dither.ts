/**
 * Grayscale + dithering untuk printer thermal ESC/POS, PURE (tanpa DOM).
 *
 * Printer thermal hanya bisa mencetak hitam/putih per dot. Foto harus
 * dikonversi ke grayscale lalu di-dither; Floyd-Steinberg dipakai karena
 * mempertahankan kesan abu-abu jauh lebih baik daripada threshold biasa.
 */

/** Bitmap 1bpp, MSB = dot paling kiri, padding per baris ke batas byte. */
export type MonoBitmap = {
  width: number;
  height: number;
  /** Panjang = ceil(width / 8) * height. */
  data: Uint8Array;
};

/** RGBA → luminance 0..255 (rumus Rec. 601 yang dipakai kebanyakan lib). */
export function rgbaToGray(rgba: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const out = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    out[i] = Math.round(0.299 * rgba[p]! + 0.587 * rgba[p + 1]! + 0.114 * rgba[p + 2]!);
  }
  return out;
}

/** Threshold sederhana: >= t → putih (0), < t → hitam (1). */
export function thresholdBitmap(
  gray: Uint8Array,
  width: number,
  height: number,
  t = 128
): MonoBitmap {
  const mono = new Uint8Array(width * height);
  for (let i = 0; i < mono.length; i++) mono[i] = gray[i]! < t ? 1 : 0;
  return packMono(mono, width, height);
}

/**
 * Floyd–Steinberg dengan pemindaian zig-zag per baris.
 *
 * Zig-zag (baris genap kiri→kanan, ganjil kanan→kiri) mencegah pola "cacing"
 * diagonal yang muncul bila error selalu didorong ke arah yang sama.
 * Error disimpan sebagai float agar pembulatan tidak menumpuk.
 */
export function floydSteinberg(gray: Uint8Array, width: number, height: number): MonoBitmap {
  const buf = Float32Array.from(gray);
  const mono = new Uint8Array(width * height);
  const at = (x: number, y: number) => y * width + x;

  for (let y = 0; y < height; y++) {
    const leftToRight = y % 2 === 0;
    for (let step = 0; step < width; step++) {
      const x = leftToRight ? step : width - 1 - step;
      const index = at(x, y);
      const old = buf[index]!;
      const isBlack = old < 128 ? 1 : 0;
      mono[index] = isBlack;
      const error = old - (isBlack ? 0 : 255);
      const dir = leftToRight ? 1 : -1;

      const spread = (dx: number, dy: number, weight: number) => {
        const nx = x + dx * dir;
        const ny = y + dy;
        if (nx < 0 || nx >= width || ny >= height) return;
        buf[at(nx, ny)] = buf[at(nx, ny)]! + error * weight;
      };
      spread(1, 0, 7 / 16);
      spread(-1, 1, 3 / 16);
      spread(0, 1, 5 / 16);
      spread(1, 1, 1 / 16);
    }
  }

  return packMono(mono, width, height);
}

/**
 * Pack array 0/1 (1 = hitam) menjadi baris byte MSB-first.
 * Bit di luar lebar gambar dibiarkan 0 (putih) agar printer tidak mencetak
 * titik liar di margin kanan.
 */
export function packMono(mono: Uint8Array, width: number, height: number): MonoBitmap {
  const rowBytes = Math.ceil(width / 8);
  const data = new Uint8Array(rowBytes * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mono[y * width + x] !== 1) continue;
      data[y * rowBytes + (x >> 3)]! |= 0x80 >> (x & 7);
    }
  }
  return { width, height, data };
}
