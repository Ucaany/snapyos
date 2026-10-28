/**
 * Adapter libcamera — kamera modul Raspberry Pi (jalur yang di photobooth-app
 * disebut `picamera2`).
 *
 * `picamera2` adalah library Python; yang dipakai di sini adalah BINARY-nya
 * (`libcamera-still`), jadi tidak perlu runtime Python di booth. Raspberry Pi OS
 * Trixie ke atas mengganti namanya menjadi `rpicam-still`, karena itu keduanya
 * dicoba berurutan.
 *
 * Kontrak yang sama dengan adapter lain: kegagalan `preview()` tidak pernah
 * membatalkan `capture()`.
 *
 * CATATAN: perintah di bawah belum dijalankan di perangkat Pi sungguhan pada
 * environment pengembangan ini. Verifikasi di Pi sebelum mengklaim kompatibel.
 */

import { createLock, runCommand } from "../http.ts";
import type { CameraRole, RuntimeConfig } from "../config.ts";
import { isJpeg, type CameraAdapter, type CameraStatus } from "./types.ts";

/** "No cameras available!" = tidak ada modul; daftar bernomor = ada kamera. */
export function hasCamera(output: string): boolean {
  if (/no cameras? available/i.test(output)) return false;
  if (/available cameras?/i.test(output)) return true;
  return /^\s*\d+\s*:\s*\S/m.test(output);
}

export function createLibcameraCamera(
  config: RuntimeConfig,
  role: CameraRole = "stills"
): CameraAdapter {
  const lock = createLock();
  const size = role === "stream" ? config.libcameraSizeStream : config.libcameraSize;
  const [width, height] = size.split("x");
  const bins = Array.from(new Set([config.libcameraBin, config.rpicamBin].filter(Boolean)));

  /** Coba tiap binary sampai ada yang menghasilkan JPEG. */
  async function shoot(extra: string[], timeoutMs: number): Promise<Buffer> {
    const geometry = [
      ...(width ? ["--width", width] : []),
      ...(height ? ["--height", height] : []),
    ];
    let lastError: unknown = null;
    for (const bin of bins) {
      try {
        const result = await lock(() =>
          runCommand(bin, ["-n", ...geometry, ...extra, "-o", "-"], timeoutMs)
        );
        if (isJpeg(result.stdout)) return result.stdout;
        lastError = new Error(`${bin} tidak menghasilkan JPEG yang valid.`);
      } catch (error) {
        lastError = error;
      }
    }
    throw new Error(
      `Kamera Pi gagal: ${lastError instanceof Error ? lastError.message : "libcamera tidak tersedia."}`
    );
  }

  return {
    kind: "libcamera",
    mock: false,

    async status(): Promise<CameraStatus> {
      let lastError: string | undefined;
      for (const bin of bins) {
        try {
          const result = await lock(() => runCommand(bin, ["--list-cameras"], 10_000));
          const connected = hasCamera(result.stdout.toString("utf8"));
          return {
            adapter: "libcamera",
            connected,
            mock: false,
            last_error: connected ? undefined : "Tidak ada kamera yang terdeteksi.",
          };
        } catch (error) {
          lastError = error instanceof Error ? error.message : "libcamera gagal dijalankan.";
        }
      }
      return { adapter: "libcamera", connected: false, mock: false, last_error: lastError };
    },

    async preview(): Promise<Buffer> {
      return shoot(["--timeout", "1", "--immediate"], 15_000);
    },

    async capture(): Promise<Buffer> {
      return shoot(["--timeout", "500", "--quality", "95"], config.timeoutMs);
    },
  };
}
