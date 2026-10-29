/**
 * Entry runtime lokal SNAPY OS.
 *
 * Enam rute lama (`/health`, `/camera/capture`, `/camera/preview`, `/print`,
 * `/printer/health`, `/printer/test`) dipertahankan byte-identik supaya kiosk
 * yang sudah terpasang tidak perlu diubah. Rute `/v1/*` bersifat aditif.
 *
 * Runtime ini menguasai kamera dan printer fisik. Semua rute selain `/health`
 * wajib token; origin di luar allowlist ditolak sebelum routing.
 */

import { join } from "node:path";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createCameraRoles } from "./camera/index.ts";
import { ConfigError, loadConfig, type RuntimeConfig } from "./config.ts";
import { getMeta, openDatabase, readVersion, type DatabaseSync } from "./db/index.ts";
import { handleExitRoute } from "./exit/index.ts";
import {
  HttpError,
  json,
  readJson,
  readRaw,
  resolveOrigin,
  setCors,
  tokenMatches,
} from "./http.ts";
import { buildPdf, printGeometry, printerNameOf, type PrintInput } from "./print/geometry.ts";
import { createPrinter } from "./print/index.ts";
import { handleSessionRoute } from "./session/index.ts";
import {
  activeSettings,
  effectiveConfig,
  handleSettingsRoute,
  printDefaults,
} from "./settings/index.ts";
import { startSyncWorker } from "./sync/worker.ts";
import { VERSION } from "./version.ts";

/**
 * Store dibuka sebelum listen: tanpa store, sesi lokal dan PIN darurat tidak
 * bisa dijanjikan. Gagal di sini lebih jujur daripada booth yang tampak hidup
 * tapi kehilangan sesi saat internet mati.
 */
function openStoreOrExit(dataDir: string): DatabaseSync {
  try {
    return openDatabase(dataDir);
  } catch (error) {
    console.error(
      `[snapyos-runtime] Store lokal gagal dibuka di ${dataDir}: ` +
        (error instanceof Error ? error.message : String(error))
    );
    process.exit(1);
  }
}

async function main(): Promise<void> {
  let config: RuntimeConfig;
  try {
    config = loadConfig(process.env);
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(`[snapyos-runtime] ${error.message}`);
      process.exit(1);
    }
    throw error;
  }

  const db = openStoreOrExit(config.dataDir);
  // Setelan tersimpan menang atas env saat memilih adapter; env tetap nilai
  // awal bila store kosong. Ganti provider berlaku setelah runtime restart.
  const effective = effectiveConfig(config, activeSettings(db, config));
  // Dua peran kamera: stills (foto) dan stream (preview). Adapter yang sama
  // dipakai untuk keduanya bila stream tidak dikonfigurasi.
  const cameras = createCameraRoles(effective);
  const camera = cameras.stills;
  const streamCamera = cameras.stream;
  const printer = createPrinter(effective);

  if (config.mock) {
    console.warn(
      "[snapyos-runtime] MODE MOCK AKTIF — tidak ada kamera/printer fisik yang dipakai."
    );
  }

  /** Kontrak lama: `ok` berarti adapter-nya hidup, `camera` berarti perangkat terdeteksi. */
  // /health terbuka tanpa token, jadi tidak boleh menyentuh kamera: probe
  // mengambil mutex yang sama dengan capture berbayar, dan N request paralel
  // mengantrekan shutter sampai capture kiosk timeout. Nilai status di-cache
  // singkat supaya liveness tetap terlihat tanpa memblokir jalur uang.
  let lastHealth: { at: number; body: { ok: boolean; camera: boolean; message?: string } } | null =
    null;
  let healthProbing = false;
  const HEALTH_CACHE_MS = 5_000;

  async function health() {
    if (lastHealth && Date.now() - lastHealth.at < HEALTH_CACHE_MS) return lastHealth.body;
    // Single-flight: request yang datang saat probe berjalan memakai nilai
    // terakhir, bukan ikut mengantre di mutex kamera.
    if (healthProbing) return lastHealth?.body ?? { ok: true, camera: false };
    healthProbing = true;
    try {
      const status = await camera.status();
      lastHealth = {
        at: Date.now(),
        body: {
          ok: true,
          camera: status.connected,
          message: status.connected ? undefined : status.last_error,
        },
      };
      return lastHealth.body;
    } catch (error) {
      lastHealth = {
        at: Date.now(),
        body: {
          ok: false,
          camera: false,
          message: error instanceof Error ? error.message : "Adapter kamera error",
        },
      };
      return lastHealth.body;
    } finally {
      healthProbing = false;
    }
  }

  async function submitPrint(input: PrintInput, test: boolean) {
    // Setelan device jadi nilai awal; kiosk boleh menimpanya per pekerjaan.
    const merged: PrintInput = { ...printDefaults(activeSettings(db, config)) };
    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined) (merged as Record<string, unknown>)[key] = value;
    }
    const printerName = printerNameOf(merged);
    await printer.health(printerName || undefined);
    const pdf = await buildPdf(merged, test);
    return printer.submit(pdf, printerName, printGeometry(merged));
  }

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const origin = resolveOrigin(req, config.allowedOrigins);
    setCors(res, origin, config.allowedOrigins);
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      return res.end();
    }
    if (req.headers.origin && !origin) {
      return json(res, 403, { message: "Origin tidak diizinkan." }, null);
    }

    // Parse target SEBELUM gate token, tapi jangan pernah membiarkan URL buruk
    // (mis. target "//") melempar keluar dari handler: dulu satu request tanpa
    // token bisa mematikan proses bridge (kamera + printer mati).
    let url: URL;
    try {
      url = new URL(req.url || "/", `http://${config.host}:${config.port}`);
    } catch {
      return json(res, 400, { message: "Request tidak valid." }, origin);
    }

    // /health terbuka: Setup Perangkat memanggilnya sebelum token diisi.
    if (
      url.pathname !== "/health" &&
      !tokenMatches(req.headers["x-bridge-token"], config.tokenDigest)
    ) {
      return json(res, 401, { message: "Token bridge tidak valid." }, origin);
    }

    try {
      if (req.method === "GET" && url.pathname === "/health") {
        return json(res, 200, await health(), origin);
      }

      if (req.method === "GET" && url.pathname === "/v1/status") {
        const cameraStatus = await camera.status().catch((error: unknown) => ({
          adapter: config.camera,
          connected: false,
          mock: camera.mock,
          last_error: error instanceof Error ? error.message : "Adapter kamera error",
        }));
        const printerStatus = await printer
          .health()
          .then((result) => ({ adapter: config.printer, ok: result.ok, mock: printer.mock }))
          .catch((error: unknown) => ({
            adapter: config.printer,
            ok: false,
            mock: printer.mock,
            last_error: error instanceof Error ? error.message : "Adapter printer error",
          }));
        const streamStatus =
          streamCamera === camera
            ? null
            : await streamCamera.status().catch((error: unknown) => ({
                adapter: config.cameraStream ?? config.camera,
                connected: false,
                mock: streamCamera.mock,
                last_error: error instanceof Error ? error.message : "Adapter preview error",
              }));
        return json(
          res,
          200,
          {
            ok: true,
            version: VERSION,
            camera: cameraStatus,
            // Aditif: kiosk lama mengabaikan kunci ini.
            camera_stream: streamStatus,
            printer: printerStatus,
            data_dir: config.dataDir,
            db_version: readVersion(db),
            // Kiosk memakainya untuk memastikan runtime di port ini memang
            // milik booth-nya — dua booth di jaringan yang sama bisa tertukar.
            business_slug: getMeta(db, "business_slug"),
            photobox_slug: getMeta(db, "photobox_slug"),
          },
          origin
        );
      }

      const settingsRoute = await handleSettingsRoute(
        { db, config },
        req.method || "GET",
        url.pathname,
        () => readJson(req, config.maxBodyBytes)
      );
      if (settingsRoute) return json(res, settingsRoute.status, settingsRoute.body, origin);

      const sessionRoute = await handleSessionRoute(
        {
          db,
          mediaDir: join(config.dataDir, "media"),
          capture: () => camera.capture(),
        },
        req.method || "GET",
        url.pathname,
        { idempotencyKey: req.headers["idempotency-key"] as string | undefined },
        () => readJson(req, config.maxBodyBytes),
        () => readRaw(req, config.maxBodyBytes),
        String(req.headers["content-type"] ?? "")
      );
      if (sessionRoute) return json(res, sessionRoute.status, sessionRoute.body, origin);

      const exitRoute = await handleExitRoute({ db }, req.method || "GET", url.pathname, () =>
        readJson(req, config.maxBodyBytes)
      );
      if (exitRoute) return json(res, exitRoute.status, exitRoute.body, origin);

      if (req.method === "GET" && url.pathname === "/v1/camera/status") {
        return json(res, 200, await camera.status(), origin);
      }

      if (req.method === "GET" && url.pathname === "/printer/health") {
        const stored = printDefaults(activeSettings(db, config)).printer_name;
        const printerName =
          url.searchParams.get("printer")?.trim() ||
          (typeof stored === "string" ? stored.trim() : "") ||
          undefined;
        return json(res, 200, await printer.health(printerName), origin);
      }

      if (req.method === "POST" && url.pathname === "/camera/capture") {
        const body = await camera.capture();
        res.statusCode = 200;
        res.setHeader("Content-Type", "image/jpeg");
        res.setHeader("Cache-Control", "no-store");
        if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
        return res.end(body);
      }

      if (req.method === "GET" && url.pathname === "/camera/preview") {
        const body = await streamCamera.preview();
        res.statusCode = 200;
        res.setHeader("Content-Type", "image/jpeg");
        res.setHeader("Cache-Control", "no-store");
        if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
        return res.end(body);
      }

      if (req.method === "POST" && url.pathname === "/print") {
        const input = (await readJson(req, config.maxBodyBytes)) as PrintInput;
        const result = await submitPrint(input, false);
        return json(res, 200, { ok: true, ...result }, origin);
      }

      if (req.method === "POST" && url.pathname === "/printer/test") {
        const input = (await readJson(req, config.maxBodyBytes)) as PrintInput;
        const result = await submitPrint(input, true);
        return json(res, 200, { ok: true, ...result }, origin);
      }

      return json(res, 404, { message: "Endpoint tidak ditemukan." }, origin);
    } catch (error) {
      const status = error instanceof HttpError ? error.statusCode : 502;
      return json(
        res,
        status >= 400 && status < 600 ? status : 502,
        {
          message: error instanceof Error ? error.message : "Runtime error.",
          // Kode mesin dipakai kiosk membedakan 403 milik cloud dari 403 lain.
          ...(error instanceof HttpError && error.code ? { error: error.code } : {}),
        },
        origin
      );
    }
  });

  server.listen(config.port, config.host, () => {
    console.log(
      `[snapyos-runtime] v${VERSION} http://${config.host}:${config.port} ` +
        `(kamera=${config.camera}, printer=${config.printer}${config.mock ? ", MOCK" : ""})`
    );
  });

  // Sync berjalan di latar belakang: kamera dan printer tidak boleh menunggu
  // jaringan. Tanpa cloud/token worker tidak start dan sesi tetap lokal.
  const stopSync = startSyncWorker({ db, config });

  const shutdown = () => {
    stopSync();
    server.close(() => process.exit(0));
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

await main();
