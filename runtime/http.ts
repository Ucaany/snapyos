/**
 * Primitif HTTP runtime: CORS, token, JSON body, dan spawn proses.
 *
 * Dipindah dari `scripts/photobooth-bridge.mjs` tanpa perubahan perilaku, dengan
 * dua perbaikan yang hanya terlihat di browser sungguhan:
 *
 * 1. `Access-Control-Allow-Headers` dulu tidak memuat `X-Bridge-Token`. Kiosk
 *    mengirim header itu, jadi preflight menolaknya dan SEMUA rute perangkat
 *    tidak pernah sampai ke server.
 * 2. Chrome mengirim preflight Private Network Access saat origin HTTPS memanggil
 *    loopback; tanpa `Access-Control-Allow-Private-Network: true` request tetap
 *    diblokir meski CORS lolos.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import { spawn } from "node:child_process";
import type { IncomingMessage, ServerResponse } from "node:http";

/** Header yang boleh dikirim kiosk ke runtime. */
export const ALLOWED_HEADERS = "Content-Type, Authorization, X-Bridge-Token, Idempotency-Key";

export type JsonValue = unknown;

/** Hasil satu rute `/v1/*`: `null` berarti path tidak cocok dan pemanggil lanjut. */
export type RouteResult = { status: number; body: unknown } | null;

export function json(
  res: ServerResponse,
  status: number,
  body: JsonValue,
  origin: string | null
): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
  res.end(JSON.stringify(body));
}

export function setCors(
  res: ServerResponse,
  origin: string | null,
  allowedOrigins: Set<string>
): void {
  if (origin && allowedOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  // PUT dipakai `PUT /v1/settings`; tanpa ini preflight browser menolaknya.
  res.setHeader("Access-Control-Allow-Methods", "GET, PUT, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", ALLOWED_HEADERS);
  res.setHeader("Access-Control-Allow-Private-Network", "true");
  res.setHeader("Access-Control-Max-Age", "600");
}

/** Origin yang lolos allowlist, atau null. */
export function resolveOrigin(req: IncomingMessage, allowedOrigins: Set<string>): string | null {
  const header = req.headers.origin;
  return typeof header === "string" && allowedOrigins.has(header) ? header : null;
}

/**
 * Perbandingan constant-time; panjang berbeda tetap aman karena kedua sisi
 * di-hash lebih dulu.
 */
export function tokenMatches(received: unknown, tokenDigest: Buffer): boolean {
  if (typeof received !== "string" || received.length === 0) return false;
  return timingSafeEqual(createHash("sha256").update(received).digest(), tokenDigest);
}

export class HttpError extends Error {
  statusCode: number;
  /** Kode mesin untuk kiosk (mis. `FIELD_NOT_DEVICE_OWNED`). */
  code?: string;
  constructor(message: string, statusCode = 400, code?: string) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function readJson(req: IncomingMessage, maxBodyBytes: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBodyBytes) {
        reject(new HttpError("Payload terlalu besar.", 413));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new HttpError("Payload JSON tidak valid.", 400));
      }
    });
    req.on("error", reject);
  });
}

/** Body mentah (multipart/upload) dengan cap ukuran yang sama. */
export function readRaw(req: IncomingMessage, maxBodyBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBodyBytes) {
        reject(new HttpError("Payload terlalu besar.", 413));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export type CommandResult = { stdout: Buffer; stderr: string };

/**
 * Jalankan binary dengan argumen array (tanpa shell, tanpa interpolasi).
 * Timeout membunuh proses dan menolak dengan pesan yang bisa dibaca operator.
 */
export function runCommand(
  binary: string,
  args: string[],
  timeoutMs: number,
  env?: Record<string, string>
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      stdio: ["ignore", "pipe", "pipe"],
      ...(env ? { env: { ...process.env, ...env } } : {}),
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 2_000).unref();
      reject(new Error(`${binary} timeout. Periksa perangkat, kabel, dan mode operasi.`));
    }, timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.once("error", (error: NodeJS.ErrnoException) => {
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

/**
 * Antrean serial per resource. Kamera menolak dua shutter bersamaan, dan job
 * cetak tidak boleh saling mendahului di printer yang sama.
 */
export function createLock(): <T>(task: () => Promise<T>) => Promise<T> {
  let queue: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    const next = queue.then(task, task);
    queue = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  };
}
