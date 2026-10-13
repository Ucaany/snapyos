/**
 * Capture util bersama — dipakai kiosk (CameraCapture) & owner camera-test.
 * Murni (tanpa DOM-event), unit-testable. docs/05 §5.5.
 */

/** Konteks 2D minimal yang dibutuhkan untuk menggambar frame (mudah di-mock). */
export type Frame2DContext = {
  translate(x: number, y: number): void;
  scale(x: number, y: number): void;
  drawImage(image: CanvasImageSource, dx: number, dy: number, dw: number, dh: number): void;
};

/**
 * Gambar frame video ke konteks 2D, dengan flip horizontal opsional.
 * Dipisah murni agar bisa di-unit-test tanpa DOM nyata.
 * `mirror` → translate(w,0) + scale(-1,1) lalu drawImage (hasil ter-mirror).
 */
export function drawVideoFrame(
  ctx: Frame2DContext,
  video: CanvasImageSource,
  w: number,
  h: number,
  mirror: boolean
): void {
  if (mirror) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, 0, 0, w, h);
}

/**
 * Ambil satu frame dari <video> aktif → JPEG blob (tanpa data URL base64).
 *
 * `mirror`: terapkan flip horizontal ke PIKsel hasil capture. Preview kiosk
 * memakai CSS `scaleX(-1)`, tapi CSS transform TIDAK memengaruhi drawImage —
 * tanpa flag ini hasil mengikuti orientasi native kamera (kamera depan/selfie
 * sering native-mirror), sehingga hasil tak konsisten dengan toggle owner.
 * Terapkan mirror di piksel agar hasil = yang dilihat customer di preview.
 */
export function captureFrame(
  video: HTMLVideoElement,
  jpegQuality: number,
  mirror = false
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
    const w = video.videoWidth;
    const h = video.videoHeight;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return reject(new Error("Canvas tidak didukung"));
    drawVideoFrame(ctx, video, w, h, mirror);
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
