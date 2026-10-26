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
import { createCamera } from "./camera/index.ts";
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
  const camera = createCamera(effective);
  const printer = createPrinter(effective);

  if (config.mock) {
    console.warn(
      "[snapyos-runtime] MODE MOCK AKTIF — tidak ada kamera/printer fisik yang dipakai."
    );
  }

  /** Kontrak lama: `ok` berarti adapter-nya hidup, `camera` berarti perangkat terdeteksi. */
  async function health() {
    try {
      const status = await camera.status();
      return {
        ok: true,
        camera: status.connected,
        message: status.connected ? undefined : status.last_error,
      };
    } catch (error) {
      return {
        ok: false,
        camera: false,
        message: error instanceof Error ? error.message : "Adapter kamera error",
      };
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

    const url = new URL(req.url || "/", `http://${config.host}:${config.port}`);

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
        return json(
          res,
          200,
          {
            ok: true,
            version: VERSION,
            camera: cameraStatus,
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
        const body = await camera.preview();
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
