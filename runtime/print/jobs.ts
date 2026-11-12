/**
 * Antrean cetak lokal — SQLite adalah sumber kebenaran saat offline.
 *
 * Status fisik kertas tidak bisa dibaca dari spooler, jadi urutannya:
 * queued → printing → submitted → (done | failed). `done` HANYA dari
 * konfirmasi operator lewat `POST /print/jobs/:id/confirm`.
 */

import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

export type PrintJobStatus = "queued" | "printing" | "submitted" | "done" | "failed";
export type PrintFailureKind = "transient" | "permanent" | "unknown";

export type PrintJob = {
  id: string;
  dedupe_key: string;
  session_id: string | null;
  mode: string;
  paper_size: string | null;
  orientation: string | null;
  copies: number;
  sheets: number;
  printer_name: string | null;
  media_name: string | null;
  pdf_path: string | null;
  spool_job_id: string | null;
  status: PrintJobStatus;
  attempts: number;
  error: string | null;
  next_retry_at: string | null;
  failure_kind: PrintFailureKind | null;
  created_at: string;
  updated_at: string;
};

export type NewPrintJob = {
  dedupeKey: string;
  sessionId?: string | null;
  mode: string;
  paperSize?: string | null;
  orientation?: string | null;
  copies: number;
  sheets: number;
  printerName?: string | null;
  mediaName?: string | null;
  pdfPath?: string | null;
};

/** Hash lembar cetak — kunci dedupe default `session_id + sheet_hash`. */
export function sheetHash(sheets: unknown): string {
  const hash = createHash("sha256");
  const rows = Array.isArray(sheets) ? sheets : [];
  for (const sheet of rows) {
    hash.update("[");
    if (Array.isArray(sheet)) {
      for (const image of sheet) {
        hash.update(String(typeof image === "string" ? image.length : 0));
        hash.update(":");
        hash.update(typeof image === "string" ? image : "");
        hash.update("|");
      }
    }
    hash.update("]");
  }
  return hash.digest("hex").slice(0, 32);
}

export function defaultDedupeKey(sessionId: string | null | undefined, sheets: unknown): string {
  return `${sessionId || "no-session"}:${sheetHash(sheets)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function findPrintJob(db: DatabaseSync, dedupeKey: string): PrintJob | null {
  return (
    (db.prepare("select * from print_jobs where dedupe_key = ?").get(dedupeKey) as
      PrintJob | undefined) ?? null
  );
}

export function getPrintJob(db: DatabaseSync, id: string): PrintJob | null {
  return (
    (db.prepare("select * from print_jobs where id = ?").get(id) as PrintJob | undefined) ?? null
  );
}

export function listPrintJobs(db: DatabaseSync, limit = 20): PrintJob[] {
  const safeLimit = Math.min(100, Math.max(1, Math.floor(limit) || 20));
  return db
    .prepare("select * from print_jobs order by created_at desc limit ?")
    .all(safeLimit) as PrintJob[];
}

/** Idempoten: dedupe_key yang sudah ada mengembalikan job lama, bukan baris baru. */
export function insertPrintJob(db: DatabaseSync, input: NewPrintJob): PrintJob {
  const existing = findPrintJob(db, input.dedupeKey);
  if (existing) return existing;
  const now = nowIso();
  const id = randomUUID();
  db.prepare(
    `insert into print_jobs (
       id, dedupe_key, session_id, mode, paper_size, orientation, copies, sheets,
       printer_name, media_name, pdf_path, spool_job_id, status, attempts, error,
       created_at, updated_at
     ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, null, 'queued', 0, null, ?, ?)`
  ).run(
    id,
    input.dedupeKey,
    input.sessionId ?? null,
    input.mode,
    input.paperSize ?? null,
    input.orientation ?? null,
    Math.max(1, Math.floor(input.copies) || 1),
    Math.max(1, Math.floor(input.sheets) || 1),
    input.printerName ?? null,
    input.mediaName ?? null,
    input.pdfPath ?? null,
    now,
    now
  );
  return getPrintJob(db, id)!;
}

export function markPrinting(db: DatabaseSync, id: string): void {
  db.prepare(
    "update print_jobs set status = 'printing', attempts = attempts + 1, error = null, next_retry_at = null, failure_kind = null, updated_at = ? where id = ?"
  ).run(nowIso(), id);
}

export function markSubmitted(db: DatabaseSync, id: string, spoolJobId: string | null): void {
  db.prepare(
    "update print_jobs set status = 'submitted', spool_job_id = ?, error = null, next_retry_at = null, failure_kind = null, updated_at = ? where id = ?"
  ).run(spoolJobId, nowIso(), id);
}

/**
 * `retryAt` diisi hanya untuk kegagalan transien; job tetap `failed` sampai
 * scheduler mengambilnya, sehingga operator tetap melihat sebabnya.
 */
export function markFailed(
  db: DatabaseSync,
  id: string,
  error: string,
  kind: PrintFailureKind = "unknown",
  retryAt?: string | null
): void {
  db.prepare(
    "update print_jobs set status = 'failed', error = ?, failure_kind = ?, next_retry_at = ?, updated_at = ? where id = ?"
  ).run(error.slice(0, 1000), kind, retryAt ?? null, nowIso(), id);
}

/**
 * Kegagalan yang bisa hilang sendiri (printer di-enable, kabel dicolok ulang)
 * dicoba ulang; kerusakan data tidak, karena mengulang tidak akan mengubah apa pun.
 */
export function classifyPrintError(message: string): PrintFailureKind {
  const text = message.toLowerCase();
  if (
    /pdf job hilang|no such file|enoent|tidak ditemukan|not found|media tidak valid|invalid media|printer tujuan tidak diketahui|belum diatur|tidak ada printer|unknown printer/.test(
      text
    )
  ) {
    return "permanent";
  }
  if (
    /disabled|offline|busy|printing|processing|timeout|temporar|spooler|econn|etimedout|kabel|belum siap|tidak siap|not responding/.test(
      text
    )
  ) {
    return "transient";
  }
  return "unknown";
}

/** Job yang `next_retry_at`-nya sudah lewat dan masih di bawah batas percobaan. */
export function dueRetryJobs(db: DatabaseSync, now: string, limit = 10): PrintJob[] {
  const safeLimit = Math.min(50, Math.max(1, Math.floor(limit) || 10));
  return db
    .prepare(
      "select * from print_jobs where status in ('failed','queued') and next_retry_at is not null and next_retry_at <= ? and attempts < ? order by next_retry_at asc limit ?"
    )
    .all(now, maxAttempts, safeLimit) as PrintJob[];
}

let maxAttempts = 3;

/** Batas percobaan global untuk scheduler (dipasang dari env saat start). */
export function setPrintRetryMax(value: number): void {
  maxAttempts = Math.min(10, Math.max(0, Math.floor(value) || 0));
}

/** Jadwalkan percobaan ulang dengan backoff; `attempt` = jumlah percobaan saat ini. */
export function scheduleRetry(
  db: DatabaseSync,
  id: string,
  attempt: number,
  backoffMs: number,
  error: string
): void {
  const retryAt = new Date(Date.now() + Math.max(0, backoffMs)).toISOString();
  db.prepare(
    "update print_jobs set status = 'failed', error = ?, failure_kind = 'transient', next_retry_at = ?, updated_at = ? where id = ?"
  ).run(error.slice(0, 1000), retryAt, nowIso(), id);
}

export function confirmPrintJob(db: DatabaseSync, id: string): PrintJob | null {
  db.prepare(
    "update print_jobs set status = 'done', next_retry_at = null, updated_at = ? where id = ?"
  ).run(nowIso(), id);
  return getPrintJob(db, id);
}

/** Kembalikan job ke antrean untuk dicoba lagi (bukan kirim ulang buta). */
export function requeuePrintJob(db: DatabaseSync, id: string): PrintJob | null {
  db.prepare(
    "update print_jobs set status = 'queued', error = null, next_retry_at = null, failure_kind = null, updated_at = ? where id = ? and status in ('failed','submitted','done','queued')"
  ).run(nowIso(), id);
  return getPrintJob(db, id);
}

export type PrintJobStats = {
  status: PrintJobStatus | null;
  last_error: string | null;
  queue_pending: number;
  queue_retrying: number;
  last_job_at: string | null;
};

/** Ringkasan untuk heartbeat cloud. */
export function printJobStats(db: DatabaseSync): PrintJobStats {
  const latest = db
    .prepare("select status, error, created_at from print_jobs order by created_at desc limit 1")
    .get() as { status: PrintJobStatus; error: string | null; created_at: string } | undefined;
  const counts = db
    .prepare("select status, count(*) as count from print_jobs group by status")
    .all() as { status: PrintJobStatus; count: number }[];
  let pending = 0;
  let retrying = 0;
  for (const row of counts) {
    if (row.status === "queued" || row.status === "printing") pending += Number(row.count) || 0;
    if (row.status === "failed") retrying += Number(row.count) || 0;
  }
  return {
    status: latest?.status ?? null,
    last_error: latest?.error ? latest.error.slice(0, 300) : null,
    queue_pending: pending,
    queue_retrying: retrying,
    last_job_at: latest?.created_at ?? null,
  };
}
