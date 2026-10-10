/**
 * Validasi upload file murni — docs/09 §9.6 (allowlist tipe + size cap),
 * docs/04 §4.8 (logo branding). Dipakai server-side (frontend tak dipercaya).
 */

export const LOGO_MAX_BYTES = 2 * 1024 * 1024; // 2 MB

/** Allowlist tipe → ekstensi final (rename server-side, docs/09 §9.6). */
export const LOGO_ALLOWED_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export type LogoValidation =
  | { ok: true; ext: string }
  | { ok: false; error: string };

/**
 * Magic-byte sniff — MIME dari client (file.type) tidak dipercaya (docs/09 §9.6).
 * Mendeteksi PNG (\x89PNG), JPEG (\xFF\xD8\xFF), WebP (RIFF....WEBP). null = tidak dikenali.
 * SVG sengaja TIDAK dideteksi: SVG dihapus dari allowlist logo (audit keamanan) —
 * SVG dapat memuat skrip sehingga berisiko XSS bila disajikan inline.
 */
export function sniffImageType(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

/**
 * Validasi file logo: tipe MIME allowlist, ukuran ≤ cap, nama wajib ada.
 * Ekstensi hasil berasal dari MIME map (bukan dari nama file — anti spoof).
 * Jika `bytes` diberikan, magic byte wajib cocok dengan MIME yang diklaim.
 */
export function validateLogoFile(
  file: {
    name?: string | null;
    type?: string | null;
    size?: number | null;
  },
  bytes?: Uint8Array | null
): LogoValidation {
  const type = (file.type ?? "").toLowerCase();
  const size = file.size ?? 0;

  if (!file.name) return { ok: false, error: "File tidak terbaca" };
  if (!LOGO_ALLOWED_TYPES[type]) {
    return { ok: false, error: "Logo harus PNG, JPG, atau WebP" };
  }
  if (size <= 0) return { ok: false, error: "File kosong" };
  if (size > LOGO_MAX_BYTES) {
    return { ok: false, error: "Ukuran logo maksimal 2 MB" };
  }
  if (bytes && sniffImageType(bytes) !== type) {
    return { ok: false, error: "Konten file tidak cocok dengan tipe yang diklaim" };
  }
  return { ok: true, ext: LOGO_ALLOWED_TYPES[type] };
}

/** Foto hasil capture — selalu JPEG (canvas.toBlob('image/jpeg'), docs/05 §5.5.2). */
export const PHOTO_MAX_BYTES = 10 * 1024 * 1024; // 10 MB per foto

/** Video background template — MP4/WebM looping (docs/05, kiosk attract-loop). */
export const VIDEO_MAX_BYTES = 15 * 1024 * 1024; // 15 MB
export const VIDEO_ALLOWED_TYPES: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
};

export type VideoValidation =
  | { ok: true; ext: string }
  | { ok: false; error: string };

/** Magic-byte sniff untuk video: MP4 (ftyp box) dan WebM (EBML). */
export function sniffVideoType(bytes: Uint8Array): string | null {
  if (bytes.length >= 12 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    return "video/mp4";
  }
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return "video/webm";
  }
  return null;
}

export function validateVideoFile(
  file: {
    name?: string | null;
    type?: string | null;
    size?: number | null;
  },
  bytes?: Uint8Array | null
): VideoValidation {
  const type = (file.type ?? "").toLowerCase();
  const size = file.size ?? 0;
  if (!file.name) return { ok: false, error: "File tidak terbaca" };
  if (!VIDEO_ALLOWED_TYPES[type]) {
    return { ok: false, error: "Video harus MP4 atau WebM" };
  }
  if (size <= 0) return { ok: false, error: "File kosong" };
  if (size > VIDEO_MAX_BYTES) {
    return { ok: false, error: "Ukuran video maksimal 15 MB" };
  }
  if (bytes && sniffVideoType(bytes) !== type) {
    return { ok: false, error: "Konten video tidak cocok dengan tipe yang diklaim" };
  }
  return { ok: true, ext: VIDEO_ALLOWED_TYPES[type] };
}

export type PhotoValidation =
  | { ok: true; ext: string }
  | { ok: false; error: string };

/**
 * Validasi foto finalize: hanya image/jpeg, ≤ cap, nama wajib ada.
 * Jika `bytes` diberikan, magic byte wajib benar-benar JPEG.
 */
export function validatePhotoFile(
  file: {
    name?: string | null;
    type?: string | null;
    size?: number | null;
  },
  bytes?: Uint8Array | null
): PhotoValidation {
  const type = (file.type ?? "").toLowerCase();
  const size = file.size ?? 0;
  if (!file.name) return { ok: false, error: "Foto tidak terbaca" };
  if (type !== "image/jpeg") return { ok: false, error: "Foto harus berformat JPEG" };
  if (size <= 0) return { ok: false, error: "Foto kosong" };
  if (size > PHOTO_MAX_BYTES) return { ok: false, error: "Ukuran foto maksimal 10 MB" };
  if (bytes && sniffImageType(bytes) !== "image/jpeg") {
    return { ok: false, error: "Konten foto tidak valid (bukan JPEG)" };
  }
  return { ok: true, ext: "jpg" };
}
