/**
 * Adapter webcam V4L2 — webcam USB di Linux (`/dev/video*`), jalur yang di
 * photobooth-app disebut `webcamv4l`.
 *
 * Satu frame diambil lewat `ffmpeg` (binary sistem yang sama yang nanti dipakai
 * untuk transcode video di Phase 3). Dua percobaan berurutan karena sebagian
 * webcam hanya mengirim MJPEG, sebagian hanya YUYV mentah.
 *
 * `fswebcam` sengaja TIDAK dipakai sebagai fallback: cara menulis ke stdout
 * berbeda-beda antar versi, dan menebak-nebak lebih buruk daripada error yang
 * jelas ("ffmpeg belum terpasang").
 */

import { access } from "node:fs/promises";
import { createLock, runCommand } from "../http.ts";
import type { CameraRole, RuntimeConfig } from "../config.ts";
import { isJpeg, type CameraAdapter, type CameraStatus } from "./types.ts";

export function createV4l2Camera(
  config: RuntimeConfig,
  role: CameraRole = "stills"
): CameraAdapter {
  const lock = createLock();
  const device = role === "stream" ? config.v4l2DeviceStream : config.v4l2Device;
  const size = role === "stream" ? config.v4l2SizeStream : config.v4l2Size;

  /** Preferensi MJPEG dulu; webcam yang tidak mendukungnya akan gagal dan
   *  dicoba lagi tanpa paksaan format masukan (ffmpeg yang meng-encode). */
  const attempts: string[][] = [
    ["-f", "v4l2", "-input_format", "mjpeg", "-video_size", size, "-i", device],
    ["-f", "v4l2", "-video_size", size, "-i", device],
  ];

  async function grab(timeoutMs: number): Promise<Buffer> {
    let lastError: unknown = null;
    for (const [index, input] of attempts.entries()) {
      const args = [
        "-hide_banner",
        "-loglevel",
        "error",
        ...input,
        "-frames:v",
        "1",
        "-f",
        "image2",
        "-c:v",
        "mjpeg",
        "-q:v",
        index === 0 ? "3" : "4",
        "-",
      ];
      try {
        const result = await lock(() => runCommand(config.ffmpegBin, args, timeoutMs));
        if (isJpeg(result.stdout)) return result.stdout;
        lastError = new Error("ffmpeg tidak menghasilkan JPEG yang valid.");
      } catch (error) {
        lastError = error;
      }
    }
    throw new Error(
      `Webcam gagal: ${lastError instanceof Error ? lastError.message : "perangkat tidak merespons."}`
    );
  }

  return {
    kind: "v4l2",
    mock: false,

    async status(): Promise<CameraStatus> {
      try {
        await access(device);
      } catch {
        return {
          adapter: "v4l2",
          connected: false,
          mock: false,
          last_error: `Perangkat ${device} tidak ditemukan.`,
        };
      }
      try {
        await lock(() =>
          runCommand(config.ffmpegBin, ["-hide_banner", "-version"], 8_000)
        );
      } catch (error) {
        return {
          adapter: "v4l2",
          connected: false,
          mock: false,
          last_error: error instanceof Error ? error.message : "ffmpeg gagal dijalankan.",
        };
      }
      return { adapter: "v4l2", connected: true, mock: false, model: device };
    },

    async preview(): Promise<Buffer> {
      return grab(15_000);
    },

    async capture(): Promise<Buffer> {
      return grab(config.timeoutMs);
    },
  };
}
