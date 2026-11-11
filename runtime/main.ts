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
import { mkdirSync } from "node:fs";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
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
import {
  buildPdf,
  mediaNameOf,
  printGeometry,
  printerNameOf,
  type PrintInput,
} from "./print/geometry.ts";
import { createPrinter } from "./print/index.ts";
import {
  confirmPrintJob,
  defaultDedupeKey,
  findPrintJob,
  getPrintJob,
  insertPrintJob,
  listPrintJobs,
  markFailed,
  markPrinting,
  markSubmitted,
  printJobStats,
  requeuePrintJob,
  type PrintJob,
} from "./print/jobs.ts";
import { handleSessionRoute } from "./session/index.ts";
import {
  activeSettings,
  effectiveConfig,
  handleSettingsRoute,
  printDefaults,
} from "./settings/index.ts";
import { startSyncWorker } from "./sync/worker.ts";
import {
  buildCloudHeartbeat,
  buildLocalDiagnostics,
  buildManualDiagnosticsExport,
  serializeDiagnostics,
} from "./diagnostics.ts";

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

  const printDir = join(config.dataDir, "print-jobs");
  mkdirSync(printDir, { recursive: true });
  // Antrean serial per printer: dua job tidak boleh saling mendahului.
  let printChain: Promise<unknown> = Promise.resolve();
  function runSerial<T>(task: () => Promise<T>): Promise<T> {
    const next = printChain.then(task, task);
    printChain = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }

  /**
   * Job `queued` yang tertinggal (crash/listrik mati saat submit) dilanjutkan
   * saat runtime start — tanpa ini kertas pelanggan tidak pernah keluar dan
   * tidak ada yang tahu. Job `submitted` tidak disentuh: spooler mungkin sudah
   * mencetaknya, dan mengirim ulang berarti cetak ganda.
   */
  function drainQueuedJobs(): void {
    // Job `printing` yang tertinggal = runtime mati di tengah cetak. Tandai
    // gagal supaya operator melihatnya; jangan kirim ulang otomatis (kertas
    // mungkin sudah keluar).
    db.prepare(
      "update print_jobs set status='failed', error=?, updated_at=? where status='printing'"
    ).run(
      "Runtime berhenti saat mencetak; periksa kertas sebelum mencetak ulang.",
      new Date().toISOString()
    );
    const pending = listPrintJobs(db, 100_000).filter((job) => job.status === "queued");
    for (const job of pending) {
      void runSerial(() => processJob(job)).catch(() => undefined);
    }
  }

  async function processJob(job: PrintJob): Promise<PrintJob> {
    if (!job.pdf_path) {
      markFailed(db, job.id, "Berkas PDF job hilang.");
      return getPrintJob(db, job.id)!;
    }
    markPrinting(db, job.id);
    try {
      const pdf = await readFile(job.pdf_path);
      await printer.health(job.printer_name || undefined);
      const geometry = printGeometry({
        paper_size: job.paper_size ?? undefined,
        orientation: job.orientation ?? undefined,
      });
      const result = await printer.submit(
        pdf,
        job.printer_name || "",
        geometry,
        job.media_name || undefined
      );
      markSubmitted(db, job.id, result.job_id);
      await unlink(job.pdf_path).catch(() => undefined);
    } catch (error) {
      markFailed(db, job.id, error instanceof Error ? error.message : "Cetak gagal.");
    }
    return getPrintJob(db, job.id)!;
  }

  async function submitPrint(input: PrintInput, test: boolean) {
    // Setelan device jadi nilai awal; kiosk boleh menimpanya per pekerjaan.
    const merged: PrintInput = { ...printDefaults(activeSettings(db, config)) };
    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined) (merged as Record<string, unknown>)[key] = value;
    }
    const printerName = printerNameOf(merged);
    const geometry = printGeometry(merged);
    const mediaName = mediaNameOf(merged, geometry);
    const pdf = await buildPdf(merged, test);

    if (test) {
      await printer.health(printerName || undefined);
      return printer.submit(pdf, printerName, geometry, mediaName);
    }

    const dedupeKey =
      typeof merged.dedupe_key === "string" && merged.dedupe_key.trim()
        ? merged.dedupe_key.trim().slice(0, 200)
        : defaultDedupeKey(
            typeof merged.session_id === "string" ? merged.session_id : null,
            merged.sheets
          );
    const existing = findPrintJob(db, dedupeKey);
    if (existing) {
      return { job_id: existing.id, status: existing.status, deduplicated: true };
    }

    const pdfPath = join(printDir, `${randomUUID()}.pdf`);
    await writeFile(pdfPath, pdf);
    const sheets = Array.isArray(merged.sheets) ? merged.sheets.length : 0;
    const job = insertPrintJob(db, {
      dedupeKey,
      sessionId: typeof merged.session_id === "string" ? merged.session_id : null,
      mode: "cups",
      paperSize: typeof merged.paper_size === "string" ? merged.paper_size : null,
      orientation: typeof merged.orientation === "string" ? merged.orientation : null,
      copies: 1,
      sheets,
      printerName,
      mediaName,
      pdfPath,
    });
    // Job yang sudah ada (dedupe) atau sudah submitted tidak dikirim ulang.
    if (job.status === "queued") {
      const processed = await runSerial(() => processJob(job));
      return {
        job_id: processed.id,
        status: processed.status,
        error: processed.error ?? undefined,
      };
    }
    return { job_id: job.id, status: job.status };
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

    let url: URL;
    try {
      url = new URL(req.url || "/", `http://${config.host}:${config.port}`);
    } catch {
      return json(res, 400, { message: "URL tidak valid." }, origin);
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
          adapter: camera.kind,
          connected: false,
          mock: camera.mock,
          last_error: error instanceof Error ? error.message : "Adapter kamera error",
        }));
        const printerStatus = await printer
          .health()
          .then((result) => ({
            adapter: printer.kind,
            ok: result.ok,
            mock: printer.mock,
            mode: "cups" as const,
            job: printJobStats(db),
          }))
          .catch((error: unknown) => ({
            adapter: printer.kind,
            ok: false,
            mock: printer.mock,
            mode: "cups" as const,
            job: printJobStats(db),
            last_error: error instanceof Error ? error.message : "Adapter printer error",
          }));
        const streamStatus =
          streamCamera === camera
            ? null
            : await streamCamera.status().catch((error: unknown) => ({
                adapter: streamCamera.kind,
                connected: false,
                mock: streamCamera.mock,
                last_error: error instanceof Error ? error.message : "Adapter preview error",
              }));
        return json(
          res,
          200,
          {
            ok: true,
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

      if (
        req.method === "GET" &&
        (url.pathname === "/v1/diagnostics" || url.pathname === "/v1/diagnostics/export")
      ) {
        const cameraStatus = await camera.status().catch((error: unknown) => ({
          adapter: camera.kind,
          connected: false,
          mock: camera.mock,
          last_error: error instanceof Error ? error.message : "Adapter kamera error",
        }));
        const printerStatus = await printer
          .health()
          .then((value) => ({
            adapter: printer.kind,
            ok: value.ok,
            printer: value.printer,
            mock: printer.mock,
            output: value.output,
            mode: "cups" as const,
            job: printJobStats(db),
          }))
          .catch((error: unknown) => ({
            adapter: printer.kind,
            ok: false,
            printer: null,
            mock: printer.mock,
            output: "",
            mode: "cups" as const,
            job: printJobStats(db),
            last_error: error instanceof Error ? error.message : "Adapter printer error",
          }));
        const streamStatus =
          streamCamera === camera ? null : await streamCamera.status().catch(() => null);
        const report = buildLocalDiagnostics({
          config,
          db,
          camera: cameraStatus,
          cameraStream: streamStatus,
          printer: printerStatus,
        });
        if (url.pathname.endsWith("/export")) {
          const body = buildManualDiagnosticsExport(report);
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.setHeader("Content-Disposition", 'attachment; filename="snapyos-diagnostics.json"');
          res.setHeader("Cache-Control", "no-store");
          if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
          return res.end(body);
        }
        return json(res, 200, JSON.parse(serializeDiagnostics(report)), origin);
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

      if (req.method === "GET" && url.pathname === "/printer/list") {
        // Deteksi read-only: antrean, setelan, dan job tidak disentuh.
        try {
          return json(
            res,
            200,
            { ok: true, adapter: printer.kind, printers: await printer.list() },
            origin
          );
        } catch (error) {
          return json(
            res,
            200,
            {
              ok: false,
              adapter: printer.kind,
              printers: [],
              reason: error instanceof Error ? error.message : "Deteksi printer gagal.",
            },
            origin
          );
        }
      }

      if (req.method === "GET" && url.pathname === "/camera/list") {
        try {
          return json(
            res,
            200,
            { ok: true, adapter: camera.kind, cameras: await camera.list() },
            origin
          );
        } catch (error) {
          return json(
            res,
            200,
            {
              ok: false,
              adapter: camera.kind,
              cameras: [],
              reason: error instanceof Error ? error.message : "Deteksi kamera gagal.",
            },
            origin
          );
        }
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
        const failed = "status" in result && result.status === "failed";
        return json(res, 200, { ok: !failed, ...result }, origin);
      }

      if (req.method === "GET" && url.pathname === "/print/jobs") {
        const limit = Number(url.searchParams.get("limit") ?? 20);
        return json(res, 200, { jobs: listPrintJobs(db, limit) }, origin);
      }

      const confirmMatch = /^\/print\/jobs\/([^/]+)\/confirm$/.exec(url.pathname);
      if (req.method === "POST" && confirmMatch) {
        const job = confirmPrintJob(db, decodeURIComponent(confirmMatch[1]!));
        if (!job) return json(res, 404, { message: "Job cetak tidak ditemukan." }, origin);
        return json(res, 200, { job }, origin);
      }

      const retryMatch = /^\/print\/jobs\/([^/]+)\/retry$/.exec(url.pathname);
      if (req.method === "POST" && retryMatch) {
        const queued = requeuePrintJob(db, decodeURIComponent(retryMatch[1]!));
        if (!queued) return json(res, 404, { message: "Job cetak tidak ditemukan." }, origin);
        if (queued.status !== "queued")
          return json(res, 409, { message: "Job sedang diproses." }, origin);
        if (!queued.pdf_path)
          return json(res, 400, { message: "Job tidak punya berkas PDF." }, origin);
        const processed = await runSerial(() => processJob(queued));
        return json(res, 200, { job: processed }, origin);
      }

      const jobMatch = /^\/print\/jobs\/([^/]+)$/.exec(url.pathname);
      if (req.method === "GET" && jobMatch) {
        const job = getPrintJob(db, decodeURIComponent(jobMatch[1]!));
        if (!job) return json(res, 404, { message: "Job cetak tidak ditemukan." }, origin);
        return json(res, 200, { job }, origin);
      }

      if (req.method === "POST" && url.pathname === "/printer/test") {
        const input = (await readJson(req, config.maxBodyBytes)) as PrintInput;
        const result = await submitPrint(input, true);
        const failed = "status" in result && result.status === "failed";
        return json(res, 200, { ok: !failed, ...result }, origin);
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

  drainQueuedJobs();

  server.once("error", (error) => {
    console.error(
      `[snapyos-runtime] Gagal listen di ${config.host}:${config.port}: ` +
        (error instanceof Error ? error.message : String(error))
    );
    process.exit(1);
  });

  server.listen(config.port, config.host, () => {
    console.log(
      `[snapyos-runtime] http://${config.host}:${config.port} ` +
        `(kamera=${config.camera}, printer=${config.printer}${config.mock ? ", MOCK" : ""})`
    );
  });

  // Sync berjalan di latar belakang: kamera dan printer tidak boleh menunggu
  // jaringan. Tanpa cloud/token worker tidak start dan sesi tetap lokal.
  const stopSync = startSyncWorker({
    db,
    config,
    heartbeat: async () => {
      const cameraStatus = await camera
        .status()
        .catch(() => ({ adapter: camera.kind, connected: false, mock: camera.mock }));
      const printerStatus = await printer
        .health()
        .catch(() => ({ ok: false, printer: null, output: "" }));
      const report = buildLocalDiagnostics({
        config,
        db,
        camera: cameraStatus,
        cameraStream: null,
        printer: {
          adapter: printer.kind,
          ...printerStatus,
          mock: printer.mock,
          mode: "cups",
          job: printJobStats(db),
        },
      });
      return buildCloudHeartbeat(report);
    },
  });

  const shutdown = () => {
    setTimeout(() => process.exit(0), 5_000).unref();
    stopSync();
    server.close(() => {
      db.close();
      process.exit(0);
    });
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

await main();
