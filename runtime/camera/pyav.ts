/**
 * Adapter PyAV — webcam lewat `av` (nama di photobooth-app: `webcampyav`).
 *
 * Dipakai bila operator butuh kontrol frame yang lebih halus daripada yang bisa
 * diberikan `ffmpeg` sekali-jalan (mis. memilih frame ke-N, bukan frame pertama).
 *
 * Butuh `python3` dengan paket `av` DAN Pillow (`frame.to_image()` memakai
 * Pillow untuk menulis JPEG). Tidak ada fallback diam-diam ke ffmpeg: kalau
 * paketnya tidak ada, operator diberi tahu supaya memilih adapter `v4l2` —
 * lebih baik daripada preview yang tampak hidup tapi berasal dari jalur lain.
 */

import { access } from "node:fs/promises";
import { createLock, runCommand } from "../http.ts";
import type { CameraRole, RuntimeConfig } from "../config.ts";
import { isJpeg, type CameraAdapter, type CameraStatus } from "./types.ts";

/** Skrip konstan milik kita sendiri — tidak ada input pengguna yang disisipkan. */
const GRAB_FRAME = [
  "import sys, av",
  "container = av.open(sys.argv[1], format='v4l2')",
  "stream = next(s for s in container.streams if s.type == 'video')",
  "for frame in container.decode(stream):",
  "    frame.to_image().save(sys.stdout.buffer, format='JPEG', quality=95)",
  "    break",
].join("\n");

const HAS_DEPS = "import av, PIL";

export function createPyavCamera(
  config: RuntimeConfig,
  role: CameraRole = "stills"
): CameraAdapter {
  const lock = createLock();
  const device = role === "stream" ? config.v4l2DeviceStream : config.v4l2Device;

  async function grab(timeoutMs: number): Promise<Buffer> {
    const result = await lock(() =>
      runCommand(config.pyavPython, ["-c", GRAB_FRAME, device], timeoutMs)
    );
    if (!isJpeg(result.stdout)) throw new Error("PyAV tidak menghasilkan JPEG yang valid.");
    return result.stdout;
  }

  return {
    kind: "pyav",
    mock: false,

    async status(): Promise<CameraStatus> {
      try {
        await lock(() => runCommand(config.pyavPython, ["-c", HAS_DEPS], 10_000));
      } catch (error) {
        return {
          adapter: "pyav",
          connected: false,
          mock: false,
          last_error: `Python/PyAV/Pillow tidak lengkap: ${
            error instanceof Error ? error.message : "cek pemasangan paket"
          }. Pakai SNAPYOS_CAMERA=v4l2 bila tidak memasang PyAV.`,
        };
      }
      try {
        await access(device);
      } catch {
        return {
          adapter: "pyav",
          connected: false,
          mock: false,
          last_error: `Perangkat ${device} tidak ditemukan.`,
        };
      }
      return { adapter: "pyav", connected: true, mock: false, model: device };
    },

    async preview(): Promise<Buffer> {
      return grab(15_000);
    },

    async capture(): Promise<Buffer> {
      return grab(config.timeoutMs);
    },
  };
}
