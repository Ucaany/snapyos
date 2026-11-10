/**
 * Validasi upload file murni — docs/09 §9.6 (allowlist tipe + size cap),
 * docs/04 §4.8 (logo branding). Dipakai server-side (frontend tak dipercaya).
 */

export const LOGO_MAX_BYTES = 2 * 1024 * 1024; // 2 MB

export type PhotoValidation = { ok: true; ext: string } | { ok: false; error: string };

/** Allowlist tipe → ekstensi final (rename server-side, docs/09 §9.6). */
export const LOGO_ALLOWED_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export type LogoValidation = { ok: true; ext: string } | { ok: false; error: string };

/**
 * Magic-byte sniff — MIME dari client (file.type) tidak dipercaya (docs/09 §9.6).
 * Mendeteksi PNG (\x89PNG), JPEG (\xFF\xD8\xFF), WebP (RIFF....WEBP). null = tidak dikenali.
 * SVG sengaja TIDAK dideteksi: SVG dihapus dari allowlist logo (audit keamanan) —
 * SVG dapat memuat skrip sehingga berisiko XSS bila disajikan inline.
 */
function hasPngSignature(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  );
}

function hasJpegStructure(bytes: Uint8Array): boolean {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return false;
  let offset = 2;
  while (offset + 1 < bytes.length) {
    if (bytes[offset] !== 0xff) return false;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) return false;
    const marker = bytes[offset++];
    if (marker === undefined) return false;
    if (marker === 0xd9) return true;
    if (marker === 0xda) {
      const end = bytes.length - 1;
      return bytes[end - 1] === 0xff && bytes[end] === 0xd9;
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 1 >= bytes.length) return false;
    const first = bytes[offset];
    const second = bytes[offset + 1];
    if (first === undefined || second === undefined) return false;
    const length = (first << 8) | second;
    if (length < 2 || offset + length > bytes.length) return false;
    offset += length;
  }
  return false;
}

export function sniffImageType(bytes: Uint8Array): string | null {
  if (hasPngSignature(bytes)) return "image/png";
  if (hasJpegStructure(bytes)) return "image/jpeg";
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

export const FINALIZE_MAX_REQUEST_BYTES = 50 * 1024 * 1024;
export const FINALIZE_MAX_PHOTOS = 50;

/** Pesan satu-satunya untuk body kebesaran — dipakai jalur Content-Length
 *  dan jalur total byte agar customer melihat teks yang sama persis. */
export const FINALIZE_TOO_LARGE_MESSAGE = "Ukuran total foto melebihi batas 50 MB";

/** Body kebesaran dipisah dari cek jumlah foto supaya pemanggil bisa
 *  memetakan 413 vs 422 secara struktural, bukan dengan mencocokkan teks. */
export function isFinalizeRequestTooLarge(totalBytes: number): boolean {
  return (
    !Number.isSafeInteger(totalBytes) || totalBytes < 0 || totalBytes > FINALIZE_MAX_REQUEST_BYTES
  );
}

export function validateFinalizeRequest(totalBytes: number, photoCount: number): string | null {
  if (isFinalizeRequestTooLarge(totalBytes)) {
    return FINALIZE_TOO_LARGE_MESSAGE;
  }
  if (!Number.isSafeInteger(photoCount) || photoCount < 1 || photoCount > FINALIZE_MAX_PHOTOS) {
    return "Jumlah foto tidak valid";
  }
  return null;
}

export function validateJpegBytes(bytes: Uint8Array): boolean {
  return hasJpegStructure(bytes);
}

export function validateJpegDimensions(bytes: Uint8Array, maxPixels = 20_000_000): boolean {
  if (!hasJpegStructure(bytes)) return false;
  let offset = 2;
  while (offset + 1 < bytes.length) {
    if (bytes[offset] !== 0xff) return false;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === undefined || marker === 0xda || marker === 0xd9) return true;
    if (marker >= 0xc0 && marker <= 0xc3) {
      if (offset + 7 >= bytes.length) return false;
      const heightHigh = bytes[offset + 3];
      const heightLow = bytes[offset + 4];
      const widthHigh = bytes[offset + 5];
      const widthLow = bytes[offset + 6];
      if (
        heightHigh === undefined ||
        heightLow === undefined ||
        widthHigh === undefined ||
        widthLow === undefined
      )
        return false;
      const height = (heightHigh << 8) | heightLow;
      const width = (widthHigh << 8) | widthLow;
      return width > 0 && height > 0 && width * height <= maxPixels;
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 1 >= bytes.length) return false;
    const first = bytes[offset];
    const second = bytes[offset + 1];
    if (first === undefined || second === undefined) return false;
    const length = (first << 8) | second;
    if (length < 2 || offset + length > bytes.length) return false;
    offset += length;
  }
  return false;
}

export function validatePhotoPayload(bytes: Uint8Array): boolean {
  return validateJpegBytes(bytes) && validateJpegDimensions(bytes);
}

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
  if (bytes && !validatePhotoPayload(bytes)) {
    return { ok: false, error: "Konten foto tidak valid (bukan JPEG utuh)" };
  }
  return { ok: true, ext: "jpg" };
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
/** Batas durasi attract-loop; ditegakkan di klien via metadata (server belum
 *  mem-parse MP4 — lihat `ponytail` di server/branding.ts). */
export const VIDEO_MAX_SECONDS = 5;
export const VIDEO_ALLOWED_TYPES: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
};

export type AssetRole = "logo" | "photo" | "video" | "fallback";
export type VideoValidation = { ok: true; ext: string } | { ok: false; error: string };

export type AssetValidation =
  { ok: true; ext: string; role: AssetRole; contentType: string } | { ok: false; error: string };

export const INSTALLER_MAX_BYTES = 2 * 1024 * 1024 * 1024;
export const INSTALLER_ALLOWED_TYPES: Record<string, string> = {
  "application/x-msi": "msi",
  "application/msix": "msix",
  "application/zip": "zip",
  "application/x-zip-compressed": "zip",
};

export const ASSET_MAX_BYTES: Record<AssetRole, number> = {
  logo: LOGO_MAX_BYTES,
  photo: PHOTO_MAX_BYTES,
  video: VIDEO_MAX_BYTES,
  fallback: LOGO_MAX_BYTES,
};

/** SHA-256 metadata is computed from validated bytes before storage. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join(
    ""
  );
}

export function validateAssetFile(
  role: AssetRole,
  file: { name?: string | null; type?: string | null; size?: number | null },
  bytes?: Uint8Array | null
): AssetValidation {
  const type = (file.type ?? "").toLowerCase();
  const size = file.size ?? 0;
  if (role === "logo" || role === "fallback") {
    const result = validateLogoFile(file, bytes);
    return result.ok ? { ...result, role, contentType: type } : result;
  }
  if (role === "photo") {
    const result = validatePhotoFile(file, bytes);
    return result.ok ? { ...result, role, contentType: type } : result;
  }
  const result = validateVideoFile(file, bytes);
  if (!result.ok) return result;
  if (size > ASSET_MAX_BYTES[role]) return { ok: false, error: "Ukuran video melewati batas." };
  return { ...result, role, contentType: type };
}

/** Magic-byte sniff untuk video: MP4 (ftyp box) dan WebM (EBML). */
export function sniffVideoType(bytes: Uint8Array): string | null {
  if (
    bytes.length >= 12 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    return "video/mp4";
  }
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  ) {
    return "video/webm";
  }
  return null;
}

export type InstallerValidation = { ok: true; ext: string } | { ok: false; error: string };

export function validateInstallerFile(
  file: { name?: string | null; type?: string | null; size?: number | null },
  bytes?: Uint8Array | null
): InstallerValidation {
  const type = (file.type ?? "").toLowerCase();
  const name = (file.name ?? "").toLowerCase();
  const ext = INSTALLER_ALLOWED_TYPES[type];
  if (
    !file.name ||
    /[\\/\0]/.test(file.name) ||
    !/^[a-z0-9][a-z0-9._ -]{0,180}\.[a-z0-9]+$/i.test(file.name)
  ) {
    return { ok: false, error: "Nama file installer tidak valid" };
  }
  if (!ext) return { ok: false, error: "Installer harus MSI, MSIX, atau ZIP" };
  if (!name.endsWith(`.${ext}`)) return { ok: false, error: "Ekstensi installer tidak cocok" };
  const size = file.size ?? 0;
  if (!Number.isSafeInteger(size) || size <= 0)
    return { ok: false, error: "File installer kosong" };
  if (size > INSTALLER_MAX_BYTES) return { ok: false, error: "Ukuran installer maksimal 2 GB" };
  if (bytes) {
    const validZip = bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
    const validMsi =
      bytes.length >= 8 &&
      bytes[0] === 0xd0 &&
      bytes[1] === 0xcf &&
      bytes[2] === 0x11 &&
      bytes[3] === 0xe0;
    if ((ext === "zip" || ext === "msix") && !validZip)
      return { ok: false, error: "Konten installer tidak valid" };
    if (ext === "msi" && !validMsi) return { ok: false, error: "Konten installer tidak valid" };
  }
  return { ok: true, ext };
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
