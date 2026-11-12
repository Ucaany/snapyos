/**
 * Konfigurasi runtime lokal — satu-satunya tempat env runtime dibaca.
 *
 * Runtime menguasai kamera dan printer fisik, jadi validasi terjadi SEBELUM
 * server listen: konfigurasi salah harus menggagalkan start, bukan menghasilkan
 * service yang jalan setengah.
 *
 * Target produksi adalah Windows, jadi default adapter mengikuti platform:
 * digiCamControl + print spooler di Windows, gphoto2 + CUPS di Linux.
 */

import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";

export const CAMERA_KINDS = [
  "digicamcontrol",
  "gphoto2",
  "libcamera",
  "v4l2",
  "pyav",
  "mock",
] as const;
export type CameraKind = (typeof CAMERA_KINDS)[number];

/**
 * Peran adapter. Satu booth boleh memakai DUA kamera: DSLR untuk foto
 * berkualitas (stills) dan webcam untuk preview hidup (stream). Bila stream
 * tidak dikonfigurasi, stills dipakai untuk keduanya.
 */
export type CameraRole = "stills" | "stream";

export const PRINTER_KINDS = ["windows", "cups", "mock"] as const;
export type PrinterKind = (typeof PRINTER_KINDS)[number];

export type RuntimeConfig = {
  host: string;
  port: number;
  /** sha256 token bridge — perbandingan constant-time memakai digest ini. */
  tokenDigest: Buffer;
  allowedOrigins: Set<string>;
  /** DB + media + karantina. Terpisah dari kode agar update tidak menyentuh data. */
  dataDir: string;
  camera: CameraKind;
  /** Adapter preview terpisah (opsional). `null` = pakai adapter stills. */
  cameraStream: CameraKind | null;
  printer: PrinterKind;
  /** true bila salah satu adapter mock dipakai (UI wajib melabelinya). */
  mock: boolean;
  gphotoBin: string;
  captureTarget: string;
  /** libcamera-still (Raspberry Pi OS Bookworm) / rpicam-still (Trixie+). */
  libcameraBin: string;
  rpicamBin: string;
  libcameraSize: string;
  libcameraSizeStream: string;
  /** ffmpeg untuk webcam V4L2 dan (Phase 3) transcode video. */
  ffmpegBin: string;
  v4l2Device: string;
  v4l2DeviceStream: string;
  v4l2Size: string;
  v4l2SizeStream: string;
  /** `v4l2-ctl` dipakai hanya untuk deteksi read-only (`--list-devices`). */
  v4l2CtlBin: string;
  /** Interpreter python3 untuk adapter PyAV (butuh paket `av` + Pillow). */
  pyavPython: string;
  timeoutMs: number;
  digicamPort: number;
  digicamCmd: string;
  sumatraBin: string;
  powershellBin: string;
  cupsBin: string;
  lpstatBin: string;
  /** `cupsenable` — untuk membuka printer yang ter-disable tanpa mouse. */
  cupsenableBin: string;
  /** Aktifkan printer `disabled` sekali sebelum submit (bukan untuk `offline`). */
  printerAutoEnable: boolean;
  /** Maksimum percobaan ulang otomatis untuk kegagalan transien. */
  printRetryMax: number;
  /** Backoff dasar retry (2^n × base, cap 2 menit). */
  printRetryBaseMs: number;
  maxBodyBytes: number;
  /**
   * Tujuan sinkronisasi (Phase 7). Kosong = booth berjalan tanpa cloud: sesi
   * tetap tersimpan lokal, hanya tidak pernah terkirim. Bukan error — runtime
   * harus tetap melayani kamera dan printer walau internet mati.
   */
  cloudUrl: string;
  /** Token device dari aktivasi; dipakai sync sesi + tulis balik setelan. */
  deviceToken: string;
  /** Versi runtime yang aman ditampilkan di diagnostics, bukan secret. */
  runtimeVersion: string;
};

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

function pickOne<T extends string>(
  raw: string | undefined,
  allowed: readonly T[],
  fallback: T,
  name: string
): T {
  const value = raw?.trim();
  if (!value) return fallback;
  if ((allowed as readonly string[]).includes(value)) return value as T;
  throw new ConfigError(`${name} harus salah satu dari: ${allowed.join(", ")}.`);
}

/**
 * Port 0 ditolak: kiosk memakai URL tetap `http://127.0.0.1:<port>` dan tidak
 * bisa membaca port acak hasil bind.
 */
function readPort(raw: string | undefined, name: string, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new ConfigError(`${name} harus bilangan bulat 1-65535.`);
  }
  return value;
}

/** Integer dengan batas; nilai tidak valid menggagalkan start (bukan diam-diam 0). */
function readCount(
  raw: string | undefined,
  name: string,
  fallback: number,
  min: number,
  max: number
): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ConfigError(`${name} harus bilangan bulat ${min}-${max}.`);
  }
  return value;
}

function defaultDataDir(): string {
  if (process.platform === "win32") {
    const base = process.env.ProgramData?.trim() || "C:\\ProgramData";
    return join(base, "SNAPYOS", "data");
  }
  return join(homedir(), ".snapyos");
}

/** `NodeJS.ProcessEnv` di repo ini mewajibkan NODE_ENV; runtime harus bisa diuji dengan env parsial. */
export type EnvLike = Record<string, string | undefined>;

export function loadConfig(env: EnvLike): RuntimeConfig {
  const token = env.PHOTOBOOTH_BRIDGE_TOKEN?.trim() || "";
  if (token.length < 16) {
    throw new ConfigError(
      "PHOTOBOOTH_BRIDGE_TOKEN wajib diisi (minimal 16 karakter).\n" +
        "Buat dengan: node -e \"console.log(require('node:crypto').randomBytes(24).toString('base64url'))\"\n" +
        "Simpan nilai yang sama di perangkat kiosk (Setup Perangkat → Bridge token)."
    );
  }

  const win32 = process.platform === "win32";
  const camera = pickOne(
    env.SNAPYOS_CAMERA,
    CAMERA_KINDS,
    win32 ? "digicamcontrol" : "gphoto2",
    "SNAPYOS_CAMERA"
  );
  const printer = pickOne(
    env.SNAPYOS_PRINTER,
    PRINTER_KINDS,
    win32 ? "windows" : "cups",
    "SNAPYOS_PRINTER"
  );
  // Preview terpisah harus dipilih eksplisit; kosong berarti booth memakai satu
  // kamera untuk stills dan preview (perilaku lama, tidak berubah).
  const streamRaw = env.SNAPYOS_CAMERA_STREAM?.trim();
  const cameraStream: CameraKind | null = streamRaw
    ? pickOne(streamRaw, CAMERA_KINDS, camera, "SNAPYOS_CAMERA_STREAM")
    : null;
  const mock = camera === "mock" || printer === "mock" || cameraStream === "mock";

  // Mock tidak boleh diam-diam jadi produksi: kamera palsu di booth berarti
  // pelanggan membayar foto yang bukan dirinya.
  if (mock && env.NODE_ENV === "production" && env.SNAPYOS_ALLOW_MOCK !== "1") {
    throw new ConfigError(
      "Adapter mock dipakai dengan NODE_ENV=production. Set SNAPYOS_ALLOW_MOCK=1 bila ini memang uji coba."
    );
  }

  const origins = (env.PHOTOBOOTH_BRIDGE_ORIGINS || "http://localhost:3000,http://127.0.0.1:3000")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (env.GPHOTO2_TIMEOUT_MS && !Number.isFinite(Number(env.GPHOTO2_TIMEOUT_MS))) {
    throw new ConfigError("GPHOTO2_TIMEOUT_MS harus angka (milidetik).");
  }

  const timeoutRaw = Number(env.GPHOTO2_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(timeoutRaw)
    ? Math.min(120_000, Math.max(5_000, timeoutRaw))
    : 45_000;

  return {
    host: env.PHOTOBOOTH_BRIDGE_HOST?.trim() || "127.0.0.1",
    port: readPort(env.PHOTOBOOTH_BRIDGE_PORT, "PHOTOBOOTH_BRIDGE_PORT", 17777),
    tokenDigest: createHash("sha256").update(token).digest(),
    allowedOrigins: new Set(origins),
    dataDir: env.SNAPYOS_DATA_DIR?.trim() || defaultDataDir(),
    camera,
    cameraStream,
    printer,
    mock,
    gphotoBin: env.GPHOTO2_BIN?.trim() || "gphoto2",
    captureTarget: env.GPHOTO2_CAPTURE_TARGET?.trim() || "",
    libcameraBin: env.LIBCAMERA_BIN?.trim() || "libcamera-still",
    // Trixie ke atas mengganti nama binary-nya; adapter mencoba keduanya.
    rpicamBin: env.RPICAM_BIN?.trim() || "rpicam-still",
    libcameraSize: env.LIBCAMERA_SIZE?.trim() || "3280x2464",
    libcameraSizeStream: env.LIBCAMERA_SIZE_STREAM?.trim() || "1280x720",
    ffmpegBin: env.FFMPEG_BIN?.trim() || "ffmpeg",
    v4l2Device: env.V4L2_DEVICE?.trim() || "/dev/video0",
    v4l2DeviceStream: env.V4L2_DEVICE_STREAM?.trim() || env.V4L2_DEVICE?.trim() || "/dev/video0",
    v4l2Size: env.V4L2_SIZE?.trim() || "1280x720",
    v4l2SizeStream: env.V4L2_SIZE_STREAM?.trim() || "640x480",
    v4l2CtlBin: env.V4L2_CTL_BIN?.trim() || "v4l2-ctl",
    pyavPython: env.PYAV_PYTHON?.trim() || "python3",
    timeoutMs,
    digicamPort: readPort(env.DIGICAMCONTROL_PORT, "DIGICAMCONTROL_PORT", 5513),
    digicamCmd:
      env.DIGICAMCONTROL_CMD?.trim() || "C:\\Program Files\\digiCamControl\\CameraControlCmd.exe",
    sumatraBin: env.SUMATRA_BIN?.trim() || "C:\\Program Files\\SumatraPDF\\SumatraPDF.exe",
    powershellBin: env.POWERSHELL_BIN?.trim() || "powershell",
    cupsBin: env.LP_BIN?.trim() || "lp",
    lpstatBin: env.LPSTAT_BIN?.trim() || "lpstat",
    cupsenableBin: env.CUPSENABLE_BIN?.trim() || "cupsenable",
    printerAutoEnable: env.SNAPYOS_PRINTER_AUTO_ENABLE !== "0",
    printRetryMax: readCount(env.SNAPYOS_PRINT_RETRY_MAX, "SNAPYOS_PRINT_RETRY_MAX", 3, 0, 10),
    printRetryBaseMs: readCount(
      env.SNAPYOS_PRINT_RETRY_BASE_MS,
      "SNAPYOS_PRINT_RETRY_BASE_MS",
      5_000,
      500,
      120_000
    ),
    // Cap body PDF/base64: 50 lembar × 8 foto tetap jauh di bawah ini.
    maxBodyBytes: 60 * 1024 * 1024,
    cloudUrl: (env.SNAPYOS_CLOUD_URL?.trim() || "").replace(/\/+$/, ""),
    deviceToken: env.SNAPYOS_DEVICE_TOKEN?.trim() || "",
    runtimeVersion: env.SNAPYOS_RUNTIME_VERSION?.trim() || "0.1.0",
  };
}
