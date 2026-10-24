/**
 * Adapter digiCamControl — jalur kamera DSLR di Windows.
 *
 * Dua jalur, dicoba berurutan:
 *
 * 1. HTTP server bawaan digiCamControl (default port 5513). Ini satu-satunya
 *    jalur yang memberi live view, jadi selalu dicoba lebih dulu.
 * 2. `CameraControlCmd.exe`. Dokumentasi resmi menyatakan CLI TIDAK bisa dipakai
 *    saat GUI digiCamControl berjalan (walau minimized), jadi kegagalan CLI
 *    diterjemahkan menjadi instruksi operator yang bisa ditindaklanjuti.
 *
 * Endpoint HTTP dan perilaku CLI di bawah ini NOT TESTED — tidak ada Windows di
 * environment pengembangan. Jangan mengklaim kompatibilitas sebelum dijalankan
 * di booth sungguhan.
 */

import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RuntimeConfig } from "../config.ts";
import { createLock, runCommand } from "../http.ts";
import { isJpeg, type CameraAdapter, type CameraStatus } from "./types.ts";

const PROBE_MS = 1_500;

export function createDigicamControlCamera(config: RuntimeConfig): CameraAdapter {
  const lock = createLock();
  const base = `http://127.0.0.1:${config.digicamPort}`;

  async function get(path: string, timeoutMs: number): Promise<Buffer> {
    const response = await fetch(`${base}${path}`, {
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`digiCamControl HTTP ${response.status} pada ${path}`);
    return Buffer.from(await response.arrayBuffer());
  }

  async function httpAlive(): Promise<boolean> {
    try {
      await get("/", PROBE_MS);
      return true;
    } catch {
      return false;
    }
  }

  async function httpCapture(): Promise<Buffer> {
    await get("/?SLC=CaptureNoAf", config.timeoutMs);
    const name = (await get("/?SLC=Get&param1=lastcaptured", 10_000)).toString("utf8").trim();
    if (!name) throw new Error("digiCamControl tidak melaporkan nama file hasil capture.");
    const body = await get(`/thumb/large/${encodeURIComponent(name)}`, 20_000);
    if (!isJpeg(body)) throw new Error("digiCamControl mengembalikan data yang bukan JPEG.");
    return body;
  }

  /**
   * Folder sementara per capture, lalu ambil satu-satunya JPEG di dalamnya.
   * Tidak bergantung pada pola penamaan internal digiCamControl.
   */
  async function cliCapture(): Promise<Buffer> {
    const directory = await mkdtemp(join(tmpdir(), "snapyos-dcc-"));
    try {
      await runCommand(
        config.digicamCmd,
        ["/capture", "/folder", directory, "/filename", `${randomUUID()}.jpg`, "/wait"],
        config.timeoutMs
      );
      const files = (await readdir(directory)).filter((entry) => /\.jpe?g$/i.test(entry));
      const first = files[0];
      if (!first) throw new Error("CameraControlCmd tidak menghasilkan file JPEG.");
      const body = await readFile(join(directory, first));
      if (!isJpeg(body)) throw new Error("CameraControlCmd menghasilkan JPEG yang tidak utuh.");
      return body;
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  let connected = false;
  let lastError: string | undefined;

  return {
    kind: "digicamcontrol",
    mock: false,

    async status(): Promise<CameraStatus> {
      if (await httpAlive()) {
        connected = true;
        lastError = undefined;
      } else {
        // Server HTTP mati bukan berarti kamera tidak ada: CLI masih bisa jalan
        // bila GUI ditutup. Status jujur = tidak diketahui, bukan terhubung.
        connected = false;
        lastError =
          `Server HTTP digiCamControl tidak aktif di port ${config.digicamPort}. ` +
          "Aktifkan web server digiCamControl, atau tutup GUI-nya agar CLI bisa dipakai.";
      }
      return { adapter: "digicamcontrol", connected, mock: false, last_error: lastError };
    },

    async preview(): Promise<Buffer> {
      const body = await get("/liveview.jpg", 10_000);
      if (!isJpeg(body)) throw new Error("Live view digiCamControl bukan JPEG yang valid.");
      return body;
    },

    async capture(): Promise<Buffer> {
      return lock(async () => {
        let httpError: string | undefined;
        if (await httpAlive()) {
          try {
            const body = await httpCapture();
            connected = true;
            lastError = undefined;
            return body;
          } catch (error) {
            httpError = error instanceof Error ? error.message : "digiCamControl HTTP error";
          }
        }
        try {
          const body = await cliCapture();
          connected = true;
          lastError = undefined;
          return body;
        } catch (error) {
          const cliMessage = error instanceof Error ? error.message : "CameraControlCmd error";
          throw new Error(
            `Capture digiCamControl gagal. HTTP: ${httpError ?? "server tidak aktif"}. CLI: ${cliMessage}. ` +
              "Pastikan digiCamControl TIDAK sedang berjalan saat memakai CLI, atau aktifkan web server-nya " +
              `di port ${config.digicamPort}.`
          );
        }
      });
    },
  };
}
