/**
 * Adapter gphoto2 — jalur Linux, dipertahankan apa adanya.
 *
 * Empat strategi capture berurutan karena perilaku kamera berbeda-beda: sebagian
 * menolak `output=Off`, sebagian butuh `--trigger-capture`, sebagian baru
 * menulis file setelah event. JPEG yang sudah tertulis tetap dipakai walau exit
 * code bukan 0.
 */

import { randomUUID } from "node:crypto";
import { readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RuntimeConfig } from "../config.ts";
import { createLock, runCommand } from "../http.ts";
import {
  isJpeg,
  type CameraAdapter,
  type CameraConfigEntry,
  type CameraConfigMap,
  type CameraInfo,
  type CameraStatus,
} from "./types.ts";

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
    const model = match[1]!.trim();
    const port = match[2]!;
    cameras.push({ id: port, label: `${model} (${port})`, model, port });
  }
  return cameras;
}

/** `--summary` memuat `Model: ...`; dipakai untuk nama kamera yang ramah. */
export function parseGphoto2Model(output: string): string | undefined {
  const match = /^\s*Model:\s*(.+)$/im.exec(output);
  return match?.[1]?.trim() || undefined;
}

/** Key yang boleh dibaca/ditulis kiosk — bukan seluruh ratusan config kamera. */
export const CAMERA_CONFIG_KEYS = [
  "iso",
  "shutterspeed",
  "f-number",
  "aperture",
  "whitebalance",
  "imagequality",
  "capturetarget",
  "output",
  "focusmode",
  "flashmode",
] as const;

export type CameraConfigKey = (typeof CAMERA_CONFIG_KEYS)[number];

export function isAllowedCameraConfigKey(key: string): key is CameraConfigKey {
  return (CAMERA_CONFIG_KEYS as readonly string[]).includes(key);
}

/**
 * `gphoto2 --get-config <key>`:
 * `Label: ...`, `Readonly: 0|1`, `Type: RADIO|MENU|...`, `Current: ...`,
 * `Choice: <index> <value>`.
 */
export function parseGphoto2Config(key: string, output: string): CameraConfigEntry | null {
  const entry: CameraConfigEntry = {
    key,
    label: key,
    readonly: false,
    type: "unknown",
    current: "",
  };
  const choices: string[] = [];
  for (const raw of output.split(/\r?\n/)) {
    const line = raw.trim();
    const label = /^Label:\s*(.+)$/i.exec(line);
    if (label) entry.label = label[1]!.trim();
    const readonly = /^Readonly:\s*(\d+)/i.exec(line);
    if (readonly) entry.readonly = readonly[1] !== "0";
    const type = /^Type:\s*(\S+)/i.exec(line);
    if (type) entry.type = type[1]!.toUpperCase();
    const current = /^Current:\s*(.*)$/i.exec(line);
    if (current) entry.current = current[1]!.trim();
    const choice = /^Choice:\s*\d+\s+(.+)$/i.exec(line);
    if (choice) choices.push(choice[1]!.trim());
  }
  if (!entry.current && !entry.label) return null;
  if (choices.length > 0) entry.choices = choices;
  return entry;
}

/** Validasi nilai terhadap `Choice` untuk tipe RADIO/MENU. */
export function validateCameraConfigValue(
  entry: CameraConfigEntry,
  value: string
): { ok: true } | { ok: false; reason: string } {
  if (entry.readonly) return { ok: false, reason: `${entry.key} readonly di kamera ini.` };
  if ((entry.type === "RADIO" || entry.type === "MENU") && entry.choices?.length) {
    if (!entry.choices.includes(value)) {
      return {
        ok: false,
        reason: `${entry.key}=${value} tidak tersedia. Pilihan: ${entry.choices.join(", ")}.`,
      };
    }
  }
  return { ok: true };
}

async function readJpegFile(file: string): Promise<Buffer | null> {
  try {
    const body = await readFile(file);
    return isJpeg(body) ? body : null;
  } catch {
    return null;
  }
}

const PREVIEW_FAILURE_LIMIT = 10;
const PREVIEW_FAILURE_MESSAGE =
  "Kamera tidak siap untuk preview. Periksa kabel USB, mode kamera (bukan playback), " +
  "dan pastikan tidak ada aplikasi lain yang memakai kamera.";

export function createGphoto2Camera(config: RuntimeConfig): CameraAdapter {
  const lock = createLock();
  const run = (args: string[], timeoutMs = config.timeoutMs) =>
    runCommand(config.gphotoBin, args, timeoutMs);

  let connected = false;
  let lastError: string | undefined;
  let previewFailures = 0;
  let summaryCache: { at: number; model?: string } | null = null;
  let lastResetAt = 0;

  async function readConfig(key: string): Promise<CameraConfigEntry | null> {
    try {
      const result = await lock(() => run(["--get-config", key], 10_000));
      return parseGphoto2Config(key, result.stdout.toString("utf8"));
    } catch {
      return null;
    }
  }

  async function readAllConfig(): Promise<CameraConfigMap> {
    const map: CameraConfigMap = {};
    for (const key of CAMERA_CONFIG_KEYS) {
      const entry = await readConfig(key);
      if (entry) map[key] = entry;
    }
    return map;
  }

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
      const cameras = parseGphoto2Cameras(result.stdout.toString("utf8"));
      connected = cameras.length > 0;
      const port = cameras[0]?.port;
      let model = cameras[0]?.model;
      if (connected) {
        const now = Date.now();
        if (!summaryCache || now - summaryCache.at > 5_000) {
          try {
            const summary = await lock(() => run(["--summary"], 10_000));
            summaryCache = { at: now, model: parseGphoto2Model(summary.stdout.toString("utf8")) };
          } catch {
            summaryCache = { at: now, model };
          }
        }
        model = summaryCache.model || model;
      }
      if (previewFailures >= PREVIEW_FAILURE_LIMIT) {
        return {
          adapter: "gphoto2",
          connected: false,
          mock: false,
          model,
          port,
          last_error: lastError || PREVIEW_FAILURE_MESSAGE,
        };
      }
      return {
        adapter: "gphoto2",
        connected,
        mock: false,
        model,
        port,
        last_error: connected ? undefined : "Kamera GPhoto2 tidak terdeteksi.",
      };
    },

    async preview(): Promise<Buffer> {
      try {
        const result = await lock(() => run(["--capture-preview", "--stdout"]));
        if (!isJpeg(result.stdout)) throw new Error("Preview kamera bukan JPEG yang valid.");
        previewFailures = 0;
        connected = true;
        lastError = undefined;
        return result.stdout;
      } catch (error) {
        previewFailures += 1;
        lastError = error instanceof Error ? error.message : String(error);
        if (previewFailures >= PREVIEW_FAILURE_LIMIT) {
          connected = false;
          lastError = PREVIEW_FAILURE_MESSAGE;
        }
        throw new Error(lastError);
      }
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
          "--force-overwrite",
          "--capture-image-and-download",
          `--filename=${file}`,
        ],
        [...target, "--force-overwrite", "--capture-image-and-download", `--filename=${file}`],
        [
          ...target,
          "--force-overwrite",
          "--trigger-capture",
          "--wait-event-and-download=FILEADDED",
          `--filename=${file}`,
        ],
        // Canon EOS 1300D baru menulis file setelah event; tanpa `--wait-event`
        // perintah selesai sebelum file muncul.
        [
          ...target,
          "--force-overwrite",
          "--wait-event=300ms",
          "--capture-image-and-download",
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
            previewFailures = 0;
            lastError = undefined;
            return body;
          } catch (error) {
            const recovered = await readJpegFile(file);
            if (recovered) {
              connected = true;
              previewFailures = 0;
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

    async config(): Promise<CameraConfigMap> {
      return readAllConfig();
    },

    async setConfig(settings: Record<string, string | number | boolean>): Promise<CameraConfigMap> {
      for (const [key, value] of Object.entries(settings)) {
        if (!isAllowedCameraConfigKey(key)) {
          throw new Error(`Key config kamera tidak diizinkan: ${key}.`);
        }
        const entry = await readConfig(key);
        if (!entry) throw new Error(`Kamera tidak mendukung config ${key}.`);
        const text = String(value);
        const valid = validateCameraConfigValue(entry, text);
        if (!valid.ok) throw new Error(valid.reason);
        try {
          await lock(() => run(["--set-config", `${key}=${text}`], 10_000));
        } catch (error) {
          throw new Error(
            `Gagal set ${key}=${text}: ${error instanceof Error ? error.message : String(error)}` +
              (entry.choices?.length ? ` Pilihan: ${entry.choices.join(", ")}.` : "")
          );
        }
      }
      return readAllConfig();
    },

    async reset(): Promise<void> {
      const now = Date.now();
      if (now - lastResetAt < 10_000) {
        throw new Error("Reset kamera dibatasi 1x per 10 detik.");
      }
      lastResetAt = now;
      await lock(() => run(["--reset"], 15_000));
      previewFailures = 0;
      lastError = undefined;
    },
  };
}
