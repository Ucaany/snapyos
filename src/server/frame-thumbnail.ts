import "server-only";

/**
 * Thumbnail frame template, WebP kecil untuk grid pilih frame.
 *
 * Sebelumnya `thumbnail_url` = `file_url`, jadi setiap kartu mengunduh PNG
 * resolusi penuh (canvas sampai 3000px). Generator ini membuat versi 480px
 * sekali saat upload; kiosk tidak pernah lagi merender/mengunduh frame penuh
 * hanya untuk menampilkan daftar.
 *
 * Kegagalan decode TIDAK pernah menggagalkan upload: pemanggil jatuh ke
 * `file_url` dan proxy frame tetap menyajikan versi `?w=480`.
 */

const THUMB_MAX_WIDTH = 480;
const THUMB_QUALITY = 78;

export type FrameThumbnail = { bytes: Buffer; contentType: "image/webp"; extension: "webp" };

export async function generateFrameThumbnail(bytes: Buffer): Promise<FrameThumbnail | null> {
  try {
    // Dynamic import: sharp memuat binary native; modul ini dipakai di route
    // upload, bukan di bundle client.
    const sharp = (await import("sharp")).default;
    const output = await sharp(bytes, { failOn: "none" })
      .rotate() // hormati EXIF orientation agar frame tidak miring
      .resize({ width: THUMB_MAX_WIDTH, withoutEnlargement: true, fit: "inside" })
      .webp({ quality: THUMB_QUALITY, alphaQuality: 90 })
      .toBuffer();
    if (output.byteLength === 0) return null;
    return { bytes: output, contentType: "image/webp", extension: "webp" };
  } catch (error) {
    console.error("[frame-thumbnail] gagal membuat thumbnail:", error);
    return null;
  }
}
