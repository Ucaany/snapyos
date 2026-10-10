/**
 * Capture util bersama — dipakai kiosk (CameraCapture) & owner camera-test.
 * Murni (tanpa DOM-event), unit-testable. docs/05 §5.5.
 */

/** Ambil satu frame dari <video> aktif → JPEG blob (tanpa data URL base64). */
export function captureFrame(
  video: HTMLVideoElement,
  jpegQuality: number
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
    ctx.drawImage(video, 0, 0, w, h);
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
