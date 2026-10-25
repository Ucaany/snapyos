/**
 * Camera error handling — docs/05 §5.5.3 (pesan user-friendly bahasa Indonesia).
 * Murni (tanpa DOM) agar bisa di-unit-test.
 */

export type CameraErrorKind =
  "NotAllowedError" | "NotFoundError" | "NotReadableError" | "OverconstrainedError" | "AbortError";

export const CAMERA_ERRORS: Record<CameraErrorKind, { message: string; action: string }> = {
  NotAllowedError: {
    message: "Izinkan akses kamera untuk mulai berfoto.",
    action: "AKTIFKAN KAMERA",
  },
  NotFoundError: {
    message:
      "Tidak ada kamera terdeteksi. Pastikan kamera perangkat aktif dan izin kamera diberikan.",
    action: "COBA LAGI",
  },
  NotReadableError: {
    message: "Kamera sedang dipakai aplikasi lain. Tutup aplikasi lain, lalu coba lagi.",
    action: "COBA LAGI",
  },
  OverconstrainedError: {
    message: "Resolusi kamera tidak didukung. Mencoba resolusi standar...",
    action: "COBA LAGI",
  },
  AbortError: {
    message: "Permintaan kamera dibatalkan.",
    action: "COBA LAGI",
  },
};

export function cameraErrorKind(name?: string | null): CameraErrorKind | null {
  if (!name) return null;
  return Object.prototype.hasOwnProperty.call(CAMERA_ERRORS, name)
    ? (name as CameraErrorKind)
    : null;
}

/**
 * Pesan + label tombol untuk satu kegagalan kamera.
 *
 * Di EXE kiosk (WebView2) izin kamera bukan dialog browser yang bisa diulang
 * dari halaman: Windows menyimpannya per aplikasi. Tanpa kalimat yang menyebut
 * Settings, petugas hanya melihat layar hitam dan menekan "AKTIFKAN KAMERA"
 * berkali-kali. Pesannya karena itu menyebut jalur yang benar; tombolnya tetap
 * ada untuk kasus izin sudah diperbaiki di Settings.
 */
export function cameraErrorCopy(
  name: string | null | undefined,
  options: { exe?: boolean } = {}
): { message: string; action: string } {
  const kind = cameraErrorKind(name);
  if (options.exe && (kind === "NotAllowedError" || kind === "NotFoundError")) {
    return {
      message:
        "Izin kamera ditolak. Buka Windows Settings → Privacy → Camera, izinkan aplikasi ini, lalu coba lagi.",
      action: "COBA LAGI",
    };
  }
  if (kind) return CAMERA_ERRORS[kind];
  return { message: "Gagal membuka kamera. Coba lagi.", action: "COBA LAGI" };
}

/** Label resolusi untuk CameraStatusBar (docs/05 §5.5.1 langkah 5). */
export function resolutionLabel(width: number): "FULL HD" | "HD" | "LOW" {
  if (width >= 1920) return "FULL HD";
  if (width >= 1280) return "HD";
  return "LOW";
}

/** Warning resolusi — null bila cukup (≥720p). */
export function resolutionWarning(width: number): string | null {
  if (width >= 1280) return null;
  if (width >= 640) return "Kualitas kamera rendah. Gunakan kamera HD (720p+).";
  return "Kualitas kamera rendah. Disarankan kamera HD (720p+).";
}
