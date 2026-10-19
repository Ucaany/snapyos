/**
 * Capture util bersama, dipakai kiosk (CameraCapture) & owner camera-test.
 * Murni (tanpa DOM-event), unit-testable. docs/05 §5.5.
 */

/** Konteks 2D minimal yang dibutuhkan untuk menggambar frame (mudah di-mock). */
export type Frame2DContext = {
  translate(x: number, y: number): void;
  scale(x: number, y: number): void;
  rotate?(angle: number): void;
  drawImage(image: CanvasImageSource, dx: number, dy: number, dw: number, dh: number): void;
};

/** Rotasi kalibrasi kamera, hanya 0/90/180/270 yang bermakna. */
export type CaptureRotation = 0 | 90 | 180 | 270;

/** Normalisasi derajat bebas ke 0/90/180/270 terdekat. */
export function normalizeRotation(degrees: number | null | undefined): CaptureRotation {
  const value = typeof degrees === "number" && Number.isFinite(degrees) ? degrees : 0;
  const normalized = ((Math.round(value / 90) * 90) % 360 + 360) % 360;
  if (normalized === 90 || normalized === 180 || normalized === 270) return normalized;
  return 0;
}

/** Zoom kalibrasi: 1 = tanpa crop, maksimum 5 (batas form owner). */
export function normalizeZoom(zoom: number | null | undefined): number {
  if (typeof zoom !== "number" || !Number.isFinite(zoom)) return 1;
  return Math.min(5, Math.max(1, zoom));
}

/** Dimensi canvas hasil rotasi: 90/270 menukar lebar dan tinggi. */
export function captureSize(
  width: number,
  height: number,
  rotation: CaptureRotation
): { width: number; height: number } {
  return rotation === 90 || rotation === 270
    ? { width: height, height: width }
    : { width, height };
}

/**
 * Gambar frame video ke konteks 2D dengan transform kalibrasi:
 * rotasi (0/90/180/270) lalu mirror horizontal lalu zoom center-crop.
 *
 * Urutan ini penting: mirror diterapkan SETELAH rotasi supaya hasil rotasi 180
 * dari kamera depan tetap "bercermin" di sumbu horizontal layar, bukan ditukar
 * dengan sumbu vertikal.
 *
 * Kontrak dengan canvas: canvas sudah berukuran `captureSize(w, h, rotation)`.
 */
export function drawVideoFrame(
  ctx: Frame2DContext,
  video: CanvasImageSource,
  w: number,
  h: number,
  mirror: boolean,
  rotation: CaptureRotation = 0,
  zoom = 1
): void {
  const size = captureSize(w, h, rotation);
  const scale = Math.min(5, Math.max(1, zoom));

  // Kanvas sudah berukuran hasil rotasi. Semua transform berlaku di ruang
  // lokal: gambar sumber selalu w×h, dipusatkan di origin, lalu diputar /
  // dicerminkan / di-zoom di sekitar titik itu.
  ctx.translate(size.width / 2, size.height / 2);
  if (rotation !== 0) ctx.rotate?.((rotation * Math.PI) / 180);
  if (mirror) ctx.scale(-1, 1);
  if (scale !== 1) ctx.scale(scale, scale);
  ctx.translate(-w / 2, -h / 2);

  ctx.drawImage(video, 0, 0, w, h);
}

/**
 * Ambil satu frame dari <video> aktif → JPEG blob (tanpa data URL base64).
 *
 * `mirror`: terapkan flip horizontal ke PIKsel hasil capture. Preview kiosk
 * memakai CSS `scaleX(-1)`, tapi CSS transform TIDAK memengaruhi drawImage ,
 * tanpa flag ini hasil mengikuti orientasi native kamera (kamera depan/selfie
 * sering native-mirror), sehingga hasil tak konsisten dengan toggle owner.
 * Terapkan mirror di piksel agar hasil = yang dilihat customer di preview.
 *
 * `rotation`/`zoom`: kalibrasi kamera dari `camera_settings` (rotasi booth
 * yang dipasang miring, zoom untuk kamera dengan FOV lebar).
 */
export function captureFrame(
  video: HTMLVideoElement,
  jpegQuality: number,
  mirror = false,
  rotation: CaptureRotation = 0,
  zoom = 1
): Promise<{ blob: Blob }> {
  return new Promise((resolve, reject) => {
    const track = (video.srcObject as MediaStream | null)?.getVideoTracks()[0];
    if (
      video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
      video.videoWidth <= 0 ||
      video.videoHeight <= 0 ||
      track?.readyState === "ended"
    ) {
      reject(new Error("Kamera belum siap"));
      return;
    }
    const size = captureSize(video.videoWidth, video.videoHeight, rotation);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return reject(new Error("Canvas tidak didukung"));
    drawVideoFrame(ctx, video, video.videoWidth, video.videoHeight, mirror, rotation, zoom);
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error("Gagal menyimpan foto"));
        resolve({ blob });
      },
      "image/jpeg",
      jpegQuality
    );
  });
}
