#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { unlink, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import PDFDocument from "pdfkit";

const host = process.env.PHOTOBOOTH_BRIDGE_HOST || "127.0.0.1";
const port = Number(process.env.PHOTOBOOTH_BRIDGE_PORT || 17777);
const gphotoBin = process.env.GPHOTO2_BIN || "gphoto2";
const captureTarget = process.env.GPHOTO2_CAPTURE_TARGET?.trim() || "";
const timeoutMs = Math.min(
  120_000,
  Math.max(5_000, Number(process.env.GPHOTO2_TIMEOUT_MS || 45_000))
);
const cupsBin = process.env.LP_BIN || "lp";
const lpstatBin = process.env.LPSTAT_BIN || "lpstat";
const maxBodyBytes = 60 * 1024 * 1024;
const allowedOrigins = new Set(
  (process.env.PHOTOBOOTH_BRIDGE_ORIGINS || "http://localhost:3000,http://127.0.0.1:3000")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);
// Bridge menguasai kamera + printer fisik. Tanpa token, proses lokal mana pun
// (atau LAN, bila host diubah) bisa memicu shutter dan mencetak. Token wajib:
// bridge menolak start tanpa PHOTOBOOTH_BRIDGE_TOKEN agar tidak ada deployment
// yang diam-diam berjalan terbuka.
const bridgeToken = process.env.PHOTOBOOTH_BRIDGE_TOKEN?.trim() || "";
let cameraQueue = Promise.resolve();

if (bridgeToken.length < 16) {
  console.error(
    "[snapyos-bridge] PHOTOBOOTH_BRIDGE_TOKEN wajib diisi (minimal 16 karakter).\n" +
      "Buat dengan: node -e \"console.log(require('node:crypto').randomBytes(24).toString('base64url'))\"\n" +
      "Simpan nilai yang sama di perangkat kiosk (Setup Perangkat → Bridge token)."
  );
  process.exit(1);
}

const tokenDigest = createHash("sha256").update(bridgeToken).digest();

/** Perbandingan constant-time; panjang berbeda tetap aman (hash dulu). */
function tokenMatches(received) {
  if (typeof received !== "string" || received.length === 0) return false;
  return timingSafeEqual(createHash("sha256").update(received).digest(), tokenDigest);
}

function json(res, status, body, origin) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
  res.end(JSON.stringify(body));
}

function setCors(res, origin) {
  if (origin && allowedOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function runCommand(binary, commandArgs, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, commandArgs, { stdio: ["ignore", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`${binary} timeout. Periksa perangkat, kabel, dan mode operasi.`));
    }, options.timeoutMs || timeoutMs);
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(
        error.code === "ENOENT" ? new Error(`${binary} belum terpasang di komputer kiosk.`) : error
      );
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      const errorText = Buffer.concat(stderr).toString("utf8").trim();
      if (code !== 0) reject(new Error(errorText || `${binary} exit code ${code ?? "unknown"}`));
      else resolve({ stdout: Buffer.concat(stdout), stderr: errorText });
    });
  });
}

function run(commandArgs, options = {}) {
  return runCommand(gphotoBin, commandArgs, options);
}

function withCameraLock(task) {
  const next = cameraQueue.then(task, task);
  cameraQueue = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

function hasDetectedCamera(output) {
  return output.split(/\r?\n/).some((line) => {
    const value = line.trim();
    if (!value || /^[-\s]+$/.test(value) || /^model\s+port$/i.test(value)) return false;
    return /\b(?:usb|serial):/i.test(value);
  });
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > maxBodyBytes) {
        reject(Object.assign(new Error("Payload print terlalu besar."), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(Object.assign(new Error("Payload JSON tidak valid."), { statusCode: 400 }));
      }
    });
    req.on("error", reject);
  });
}

function mmToPt(value) {
  return value * (72 / 25.4);
}

function printGeometry(input = {}) {
  const paperSize = input.paper_size === "A6" ? "A6" : "4x6";
  const base = paperSize === "A6" ? { width: 105, height: 148 } : { width: 101.6, height: 152.4 };
  const landscape = input.orientation === "landscape";
  const margin = Math.min(
    20,
    Math.max(0, Number.isFinite(input.margins_mm) ? input.margins_mm : 0)
  );
  return {
    widthMm: landscape ? base.height : base.width,
    heightMm: landscape ? base.width : base.height,
    marginMm: margin,
  };
}

function decodeImage(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 16 * 1024 * 1024) {
    throw new Error("Data foto tidak valid.");
  }
  const body = Buffer.from(value, "base64");
  if (body.length < 4) throw new Error("Foto kosong.");
  return body;
}

async function readJpegFile(file) {
  try {
    const body = await readFile(file);
    if (
      body.length >= 4 &&
      body[0] === 0xff &&
      body[1] === 0xd8 &&
      body[body.length - 2] === 0xff &&
      body[body.length - 1] === 0xd9
    ) {
      return body;
    }
  } catch {
    return null;
  }
  return null;
}

function buildPdf(input, test = false) {
  const geometry = printGeometry(input);
  const width = mmToPt(geometry.widthMm);
  const height = mmToPt(geometry.heightMm);
  const margin = mmToPt(geometry.marginMm);
  const contentWidth = Math.max(1, width - margin * 2);
  const contentHeight = Math.max(1, height - margin * 2);
  const doc = new PDFDocument({ autoFirstPage: false, margin: 0, compress: true });
  const chunks = [];
  doc.on("data", (chunk) => chunks.push(chunk));
  const result = new Promise((resolve, reject) => {
    doc.once("end", () => resolve(Buffer.concat(chunks)));
    doc.once("error", reject);
  });

  if (test) {
    doc.addPage({ size: [width, height], margin: 0 });
    doc.save().lineWidth(2).rect(margin, margin, contentWidth, contentHeight).stroke().restore();
    doc
      .font("Helvetica-Bold")
      .fontSize(16)
      .text(String(input.title || "SNAPYOS TEST"), margin, margin + 18, {
        width: contentWidth,
        align: "center",
      });
    const lines = Array.isArray(input.lines) ? input.lines.slice(0, 5) : [];
    doc
      .font("Helvetica")
      .fontSize(9)
      .text(lines.map(String).join("\n"), margin + 8, margin + 48, {
        width: contentWidth - 16,
        align: "center",
      });
    doc
      .save()
      .rect(margin + 8, height - margin - 14, contentWidth - 16, 6)
      .fill("#111111")
      .restore();
  } else {
    if (!Array.isArray(input.sheets) || input.sheets.length < 1 || input.sheets.length > 50) {
      throw new Error("Lembar cetak tidak valid.");
    }
    for (const sheet of input.sheets) {
      if (!Array.isArray(sheet) || sheet.length < 1 || sheet.length > 8) {
        throw new Error("Isi lembar cetak tidak valid.");
      }
      doc.addPage({ size: [width, height], margin: 0 });
      const rowHeight = contentHeight / sheet.length;
      sheet.forEach((encoded, index) => {
        doc.image(decodeImage(encoded), margin, margin + rowHeight * index, {
          fit: [contentWidth, rowHeight],
          align: "center",
          valign: "center",
        });
      });
    }
  }
  doc.end();
  return result;
}

async function submitCups(input, test = false) {
  const printerName = typeof input.printer_name === "string" ? input.printer_name.trim() : "";
  await printerHealth(printerName || undefined);
  const pdf = await buildPdf(input, test);
  const file = join(tmpdir(), `snapyos-${randomUUID()}.pdf`);
  try {
    await writeFile(file, pdf, { mode: 0o600 });
    const geometry = printGeometry(input);
    const args = [];
    if (printerName) {
      args.push("-d", printerName.slice(0, 128));
    }
    args.push(
      "-n",
      "1",
      "-o",
      `media=Custom.${geometry.widthMm}x${geometry.heightMm}mm`,
      "-o",
      "fit-to-page",
      file
    );
    const result = await runCommand(cupsBin, args, { timeoutMs });
    return { job_id: result.stdout.toString("utf8").trim() || null };
  } finally {
    await unlink(file).catch(() => undefined);
  }
}

async function printerHealth(printerName) {
  const args = ["-p"];
  if (printerName) args.push(printerName);
  const printerResult = await runCommand(lpstatBin, args, { timeoutMs: 10_000 });
  const printerOutput = printerResult.stdout.toString("utf8").trim();
  if (/\bdisabled\b/i.test(printerOutput)) {
    throw new Error(`Printer ${printerName || "default"} sedang disabled di CUPS.`);
  }

  let defaultOutput = "";
  if (!printerName) {
    const defaultResult = await runCommand(lpstatBin, ["-d"], { timeoutMs: 10_000 });
    defaultOutput = defaultResult.stdout.toString("utf8").trim();
    if (!/system default destination:\s*\S+/i.test(defaultOutput)) {
      throw new Error("Printer default CUPS belum diatur. Jalankan lpoptions -d <printer>.");
    }
  }

  return {
    ok: true,
    printer: printerName || null,
    output: [printerOutput, defaultOutput].filter(Boolean).join("\n"),
  };
}

async function health() {
  try {
    const result = await withCameraLock(() => run(["--auto-detect"], { timeoutMs: 10_000 }));
    const output = result.stdout.toString("utf8");
    const camera = hasDetectedCamera(output);
    return { ok: true, camera, message: camera ? undefined : "Kamera GPhoto2 tidak terdeteksi." };
  } catch (error) {
    return {
      ok: false,
      camera: false,
      message: error instanceof Error ? error.message : "gphoto2 error",
    };
  }
}

async function capture() {
  const file = join(tmpdir(), `snapyos-${randomUUID()}.jpg`);
  const target = captureTarget ? ["--set-config", `capturetarget=${captureTarget}`] : [];
  const attempts = [
    [...target, "--set-config", "output=Off", "--capture-image-and-download", `--filename=${file}`],
    [...target, "--capture-image-and-download", `--filename=${file}`],
    [...target, "--trigger-capture", "--wait-event-and-download=FILEADDED", `--filename=${file}`],
  ];
  let lastError = null;
  try {
    for (const args of attempts) {
      await unlink(file).catch(() => undefined);
      try {
        await withCameraLock(() => run(args));
        const body = await readJpegFile(file);
        if (!body) throw new Error("gphoto2 tidak menghasilkan JPEG yang valid.");
        return body;
      } catch (error) {
        const recovered = await readJpegFile(file);
        if (recovered) return recovered;
        lastError = error;
      }
    }
    throw new Error(
      `GPhoto2 gagal mengambil foto. ${lastError instanceof Error ? lastError.message : "Periksa kamera dan mode capture."}`
    );
  } finally {
    await unlink(file).catch(() => undefined);
  }
}

async function preview() {
  const result = await withCameraLock(() => run(["--capture-preview", "--stdout"]));
  if (result.stdout.length < 4 || result.stdout[0] !== 0xff || result.stdout[1] !== 0xd8) {
    throw new Error("Preview kamera bukan JPEG yang valid.");
  }
  return result.stdout;
}

const server = createServer(async (req, res) => {
  const origin =
    typeof req.headers.origin === "string" && allowedOrigins.has(req.headers.origin)
      ? req.headers.origin
      : null;
  setCors(res, origin);
  if (req.method === "OPTIONS") return res.end();
  if (req.headers.origin && !origin)
    return json(res, 403, { message: "Origin tidak diizinkan." }, null);
  const url = new URL(req.url || "/", `http://${host}:${port}`);
  // /health hanya melaporkan ada/tidaknya kamera dan dipakai Setup Perangkat
  // sebelum token diisi, jadi dibiarkan terbuka. Semua rute lain menggerakkan
  // perangkat fisik dan wajib token.
  if (url.pathname !== "/health" && !tokenMatches(req.headers["x-bridge-token"]))
    return json(res, 401, { message: "Token bridge tidak valid." }, origin);
  try {
    if (req.method === "GET" && url.pathname === "/health")
      return json(res, 200, await health(), origin);
    if (req.method === "GET" && url.pathname === "/printer/health") {
      const printerName = url.searchParams.get("printer")?.trim() || undefined;
      return json(res, 200, await printerHealth(printerName), origin);
    }
    if (req.method === "POST" && url.pathname === "/camera/capture") {
      const body = await capture();
      res.statusCode = 200;
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Cache-Control", "no-store");
      if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
      return res.end(body);
    }
    if (req.method === "GET" && url.pathname === "/camera/preview") {
      const body = await preview();
      res.statusCode = 200;
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Cache-Control", "no-store");
      if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
      return res.end(body);
    }
    if (req.method === "POST" && url.pathname === "/print") {
      const input = await readJson(req);
      const result = await submitCups(input, false);
      return json(res, 200, { ok: true, ...result }, origin);
    }
    if (req.method === "POST" && url.pathname === "/printer/test") {
      const input = await readJson(req);
      const result = await submitCups(input, true);
      return json(res, 200, { ok: true, ...result }, origin);
    }
    return json(res, 404, { message: "Endpoint tidak ditemukan." }, origin);
  } catch (error) {
    const status =
      error && typeof error === "object" && "statusCode" in error ? Number(error.statusCode) : 502;
    return json(
      res,
      status >= 400 && status < 600 ? status : 502,
      { message: error instanceof Error ? error.message : "Bridge error." },
      origin
    );
  }
});

server.listen(port, host, () => console.log(`[snapyos-bridge] http://${host}:${port}`));
