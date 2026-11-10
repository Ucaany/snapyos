/**
 * Adapter gphoto2 — jalur Linux, dipertahankan apa adanya.
 *
 * Tiga strategi capture berurutan karena perilaku kamera berbeda-beda: sebagian
 * menolak `output=Off`, sebagian butuh `--trigger-capture`. JPEG yang sudah
 * tertulis tetap dipakai walau exit code bukan 0.
 */

import { randomUUID } from "node:crypto";
import { readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RuntimeConfig } from "../config.ts";
import { createLock, runCommand } from "../http.ts";
import { isJpeg, type CameraAdapter, type CameraInfo, type CameraStatus } from "./types.ts";

function hasDetectedCamera(output: string): boolean {
  return output.split(/\r?\n/).some((line) => {
    const value = line.trim();
    if (!value || /^[-\s]+$/.test(value) || /^model\s+port$/i.test(value)) return false;
    return /\b(?:usb|serial):/i.test(value);
  });
}

/** `--auto-detect`: `Model ... Port` per baris; port jadi `id` stabil. */
export function parseGphoto2Cameras(output: string): CameraInfo[] {
  const cameras: CameraInfo[] = [];
  for (const raw of output.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^[-\s]+$/.test(line) || /^model\s+port$/i.test(line)) continue;
    const match = /^(.*?)\s+((?:usb|serial):\S+)$/i.exec(line);
    if (!match) continue;
    cameras.push({ id: match[2]!, label: `${match[1]!.trim()} (${match[2]})` });
  }
  return cameras;
}

async function readJpegFile(file: string): Promise<Buffer | null> {
  try {
    const body = await readFile(file);
    return isJpeg(body) ? body : null;
  } catch {
    return null;
  }
}

export function createGphoto2Camera(config: RuntimeConfig): CameraAdapter {
  const lock = createLock();
  const run = (args: string[], timeoutMs = config.timeoutMs) =>
    runCommand(config.gphotoBin, args, timeoutMs);

  let connected = false;

  return {
    kind: "gphoto2",
    mock: false,

    async list(): Promise<CameraInfo[]> {
      const result = await lock(() => run(["--auto-detect"], 10_000));
      return parseGphoto2Cameras(result.stdout.toString("utf8"));
    },

    /**
     * Melempar bila gphoto2 sendiri gagal dijalankan — itu beda dengan "tidak ada
     * kamera". `/health` lama membedakan keduanya, dan Setup Perangkat bergantung
     * pada perbedaan itu.
     */
    async status(): Promise<CameraStatus> {
      const result = await lock(() => run(["--auto-detect"], 10_000));
      connected = hasDetectedCamera(result.stdout.toString("utf8"));
      return {
        adapter: "gphoto2",
        connected,
        mock: false,
        last_error: connected ? undefined : "Kamera GPhoto2 tidak terdeteksi.",
      };
    },

    async preview(): Promise<Buffer> {
      const result = await lock(() => run(["--capture-preview", "--stdout"]));
      if (!isJpeg(result.stdout)) throw new Error("Preview kamera bukan JPEG yang valid.");
      return result.stdout;
    },

    async capture(): Promise<Buffer> {
      const file = join(tmpdir(), `snapyos-${randomUUID()}.jpg`);
      const target = config.captureTarget
        ? ["--set-config", `capturetarget=${config.captureTarget}`]
        : [];
      const attempts = [
        [
          ...target,
          "--set-config",
          "output=Off",
          "--capture-image-and-download",
          `--filename=${file}`,
        ],
        [...target, "--capture-image-and-download", `--filename=${file}`],
        [
          ...target,
          "--trigger-capture",
          "--wait-event-and-download=FILEADDED",
          `--filename=${file}`,
        ],
      ];
      let lastError: unknown = null;
      try {
        for (const args of attempts) {
          await unlink(file).catch(() => undefined);
          try {
            await lock(() => run(args));
            const body = await readJpegFile(file);
            if (!body) throw new Error("gphoto2 tidak menghasilkan JPEG yang valid.");
            connected = true;
            lastError = undefined;
            return body;
          } catch (error) {
            const recovered = await readJpegFile(file);
            if (recovered) {
              connected = true;
              return recovered;
            }
            lastError = error;
          }
        }
        throw new Error(
          `GPhoto2 gagal mengambil foto. ${lastError instanceof Error ? lastError.message : "Periksa kamera dan mode capture."}`
        );
      } finally {
        await unlink(file).catch(() => undefined);
      }
    },
  };
}
