/**
 * Endpoint sesi lokal (`/v1/sessions*`).
 *
 * Runtime ini pemilik kamera fisik, jadi capture ditulis ke disk di sini dan
 * bukan di kiosk. Semua sesi berprefix `local_`: ID cloud adalah UUID, dan
 * mencampur keduanya akan membuat sync worker mengirim balik sesi yang sudah
 * ada di cloud.
 *
 * Handler mengembalikan `{status, body}` (bukan menulis ke `res`) supaya rute
 * ini bisa diuji tanpa server HTTP.
 */

import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { HttpError, type RouteResult } from "../http.ts";
import { getMeta, insertSession } from "../db/index.ts";

export const LOCAL_SESSION_PREFIX = "local_";

export type SessionContext = {
  db: DatabaseSync;
  /** Akar media; foto ditulis ke `<mediaDir>/<sessionId>/`. */
  mediaDir: string;
  /** Ambil satu frame dari kamera yang sedang dipakai runtime. */
  capture: () => Promise<Buffer>;
  now?: () => number;
};

type SessionRow = {
  id: string;
  cloud_id: string | null;
  business_slug: string;
  photobox_slug: string;
  package_id: string;
  template_id: string | null;
  state: string;
  expires_at: string;
  retake_count: number;
  package_snapshot_json: string;
  payment_method: string | null;
  client_created_at: string;
  synced_at: string | null;
  result_token: string | null;
  result_expires_at: string | null;
  created_at: string;
  updated_at: string;
};

type CaptureRow = {
  id: string;
  slot_index: number;
  file_path: string;
  created_at: string;
};

export function newSessionId(now = Date.now()): string {
  return `${LOCAL_SESSION_PREFIX}${now.toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function isLocalId(id: string): boolean {
  return id.startsWith(LOCAL_SESSION_PREFIX);
}

function findSession(db: DatabaseSync, id: string): SessionRow | null {
  return (
    (db.prepare("select * from sessions where id = ?").get(id) as SessionRow | undefined) ?? null
  );
}

function listCaptures(db: DatabaseSync, sessionId: string): CaptureRow[] {
  return db
    .prepare(
      "select id, slot_index, file_path, created_at from captures where session_id = ? order by slot_index"
    )
    .all(sessionId) as CaptureRow[];
}

function present(row: SessionRow, captures: CaptureRow[] = []) {
  return {
    id: row.id,
    cloud_id: row.cloud_id,
    business_slug: row.business_slug,
    photobox_slug: row.photobox_slug,
    package_id: row.package_id,
    template_id: row.template_id,
    state: row.state,
    expires_at: row.expires_at,
    retake_count: row.retake_count,
    package_snapshot: safeParse(row.package_snapshot_json),
    payment_method: row.payment_method,
    client_created_at: row.client_created_at,
    synced_at: row.synced_at,
    result_token: row.result_token,
    result_expires_at: row.result_expires_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    captures: captures.map((capture) => ({
      id: capture.id,
      slot_index: capture.slot_index,
      created_at: capture.created_at,
    })),
  };
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function requireSession(db: DatabaseSync, id: string): SessionRow {
  if (!isLocalId(id)) throw new HttpError("Sesi lokal tidak ditemukan.", 404);
  const row = findSession(db, id);
  if (!row) throw new HttpError("Sesi lokal tidak ditemukan.", 404);
  return row;
}

function requireActive(row: SessionRow): void {
  if (row.state !== "active") {
    throw new HttpError(`Sesi sudah ${row.state === "finalized" ? "final" : "dibatalkan"}.`, 409);
  }
}

function asObject(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError("Payload harus objek JSON.", 400);
  }
  return body as Record<string, unknown>;
}

function optionalString(value: unknown, name: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new HttpError(`${name} harus teks.`, 400);
  return value;
}

function slotOf(value: unknown): number {
  const slot = Number(value);
  if (!Number.isInteger(slot) || slot < 0 || slot > 99) {
    throw new HttpError("slot_index harus bilangan bulat 0-99.", 400);
  }
  return slot;
}

function mediaDirFor(ctx: SessionContext, sessionId: string): string {
  const dir = join(ctx.mediaDir, sessionId);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function nowIso(ctx: SessionContext): string {
  return new Date(ctx.now?.() ?? Date.now()).toISOString();
}

function touch(db: DatabaseSync, id: string, at: string): void {
  db.prepare("update sessions set updated_at = ? where id = ?").run(at, id);
}

/** POST /v1/sessions */
export function createSession(
  ctx: SessionContext,
  raw: unknown
): { status: number; body: unknown } {
  const body = asObject(raw);
  const snapshot = body.package_snapshot;
  if (!snapshot || typeof snapshot !== "object") {
    throw new HttpError("package_snapshot wajib diisi.", 400);
  }
  const snapshotObject = snapshot as Record<string, unknown>;
  const packageId =
    optionalString(body.package_id, "package_id") ??
    optionalString(snapshotObject.package_id, "package_snapshot.package_id") ??
    optionalString(snapshotObject.id, "package_snapshot.id");
  if (!packageId) throw new HttpError("package_id wajib diisi.", 400);

  const businessSlug =
    optionalString(body.business_slug, "business_slug") ?? getMeta(ctx.db, "business_slug");
  const photoboxSlug =
    optionalString(body.photobox_slug, "photobox_slug") ?? getMeta(ctx.db, "photobox_slug");
  if (!businessSlug || !photoboxSlug) {
    throw new HttpError("Runtime belum dikonfigurasi (business_slug/photobox_slug kosong).", 409);
  }

  const timerSeconds = Number(body.timer_seconds);
  const id = newSessionId(ctx.now?.() ?? Date.now());
  insertSession(
    ctx.db,
    {
      id,
      businessSlug,
      photoboxSlug,
      packageId,
      templateId: optionalString(body.template_id, "template_id"),
      packageSnapshot: snapshot,
      paymentMethod: optionalString(body.payment_method, "payment_method"),
      timerSeconds: Number.isFinite(timerSeconds) ? timerSeconds : 0,
      clientCreatedAt: optionalString(body.client_created_at, "client_created_at") ?? undefined,
    },
    ctx.now?.() ?? Date.now()
  );
  const row = requireSession(ctx.db, id);
  return { status: 201, body: present(row) };
}

/** GET /v1/sessions/:id */
export function readSession(ctx: SessionContext, id: string) {
  const row = requireSession(ctx.db, id);
  return { status: 200, body: present(row, listCaptures(ctx.db, id)) };
}

/**
 * POST /v1/sessions/:id/capture
 *
 * `Idempotency-Key` wajib: kiosk mengulang request saat jaringan putus, dan
 * dua baris untuk satu slot berarti dua foto tertagih. Key yang sama selalu
 * mengembalikan capture yang sama, bukan menulis ulang file.
 */
export async function captureSlot(
  ctx: SessionContext,
  id: string,
  idempotencyKey: string | undefined,
  raw: unknown
): Promise<{ status: number; body: unknown }> {
  const key = idempotencyKey?.trim();
  if (!key) throw new HttpError("Header Idempotency-Key wajib dikirim.", 400);

  const row = requireSession(ctx.db, id);
  const body = raw === undefined || raw === null ? {} : asObject(raw);
  const slot = slotOf(body.slot_index ?? 0);

  const existing = ctx.db
    .prepare(
      "select id, slot_index, file_path, created_at from captures where session_id = ? and idempotency_key = ?"
    )
    .get(id, key) as CaptureRow | undefined;
  if (existing) return { status: 200, body: { ok: true, replay: true, capture: existing } };

  requireActive(row);

  // Slot sudah terisi dengan key lain: jangan buang satu shutter hanya untuk
  // menemukan konflik di insert. Insert di bawah tetap penjaga balapan.
  const occupiedBefore = ctx.db
    .prepare(
      "select id, slot_index, file_path, created_at from captures where session_id = ? and slot_index = ?"
    )
    .get(id, slot) as CaptureRow | undefined;
  if (occupiedBefore) {
    return { status: 200, body: { ok: true, replay: true, capture: occupiedBefore } };
  }

  const at = nowIso(ctx);
  const filePath = join(mediaDirFor(ctx, id), `${slot}.jpg`);
  const captureId = `cap_${randomUUID()}`;
  const buffer = await ctx.capture();
  try {
    ctx.db
      .prepare(
        `insert into captures (id, session_id, slot_index, file_path, created_at, idempotency_key)
         values (?, ?, ?, ?, ?, ?)`
      )
      .run(captureId, id, slot, filePath, at, key);
  } catch (error) {
    // Slot sudah terisi (key berbeda, slot sama): kirim baris yang ada, bukan 500.
    const occupied = ctx.db
      .prepare(
        "select id, slot_index, file_path, created_at from captures where session_id = ? and slot_index = ?"
      )
      .get(id, slot) as CaptureRow | undefined;
    if (occupied) return { status: 200, body: { ok: true, replay: true, capture: occupied } };
    throw error;
  }
  try {
    writeFileSync(filePath, buffer);
  } catch (error) {
    // Disk gagal: hapus baris supaya retry dengan key yang sama benar-benar
    // menulis file, bukan mengembalikan capture tanpa file.
    ctx.db.prepare("delete from captures where id = ?").run(captureId);
    throw error;
  }
  touch(ctx.db, id, at);
  return {
    status: 201,
    body: { ok: true, capture: { id: captureId, slot_index: slot, created_at: at } },
  };
}

type Part = { name: string; filename: string | null; data: Buffer };

/**
 * Parser multipart/form-data secukupnya untuk kontrak finalize.
 * Tidak memakai dependensi: hanya `name`, `filename`, dan isi biner yang
 * dibutuhkan, dan body sudah dibatasi `maxBodyBytes` sebelum sampai di sini.
 */
export function parseMultipart(body: Buffer, contentType: string): Part[] {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  const boundary = (match?.[1] ?? match?.[2] ?? "").trim();
  if (!boundary) throw new HttpError("Multipart tanpa boundary.", 400);

  const delimiter = Buffer.from(`--${boundary}`);
  const parts: Part[] = [];
  let cursor = body.indexOf(delimiter);
  if (cursor < 0) throw new HttpError("Multipart tidak valid.", 400);

  while (cursor >= 0) {
    let start = cursor + delimiter.length;
    if (body.slice(start, start + 2).toString() === "--") break;
    if (body.slice(start, start + 2).toString() === "\r\n") start += 2;
    const next = body.indexOf(delimiter, start);
    if (next < 0) break;
    const chunk = body.slice(start, next - 2); // buang CRLF sebelum delimiter
    const headerEnd = chunk.indexOf("\r\n\r\n");
    if (headerEnd >= 0) {
      const headers = chunk.slice(0, headerEnd).toString("utf8");
      const name = /name="([^"]*)"/i.exec(headers)?.[1] ?? "";
      const filename = /filename="([^"]*)"/i.exec(headers)?.[1] ?? null;
      if (name) parts.push({ name, filename, data: chunk.slice(headerEnd + 4) });
    }
    cursor = next;
  }
  return parts;
}

/** POST /v1/sessions/:id/finalize — field sama dengan `buildFinalizeForm`. */
export function finalizeSession(
  ctx: SessionContext,
  id: string,
  parts: Part[],
  now = Date.now()
): { status: number; body: unknown } {
  const row = requireSession(ctx.db, id);
  const existing = ctx.db.prepare("select id from finalize_queue where session_id = ?").get(id) as
    { id: string } | undefined;
  if (existing) {
    return {
      status: 200,
      body: { ok: true, replay: true, session: present(requireSession(ctx.db, id)) },
    };
  }
  requireActive(row);

  const dir = mediaDirFor(ctx, id);
  const fields: Record<string, string> = {};
  const photos: string[] = [];
  const gifPhotos: string[] = [];
  const gifAllPhotos: string[] = [];

  // Batas SEBELUM writeFileSync: satu request tanpa batas bisa membuat >1 juta
  // file (satu per part) dan menghabiskan volume booth sampai SQLite gagal baca.
  // 64 = foto final + dua set GIF (proses & semua capture), masing-masing <= 8.
  const MAX_MEDIA_PARTS = 64;
  const MAX_PART_BYTES = 12 * 1024 * 1024;
  const MAX_TOTAL_MEDIA_BYTES = 60 * 1024 * 1024;
  let mediaBytes = 0;

  for (const part of parts) {
    if (part.name === "photos" || part.name === "gif_photos" || part.name === "gif_all_photos") {
      const target =
        part.name === "photos" ? photos : part.name === "gif_photos" ? gifPhotos : gifAllPhotos;
      if (photos.length + gifPhotos.length + gifAllPhotos.length >= MAX_MEDIA_PARTS) {
        throw new HttpError("Jumlah foto melebihi batas.", 400);
      }
      if (part.data.length > MAX_PART_BYTES) {
        throw new HttpError("Ukuran satu foto melebihi batas.", 413);
      }
      mediaBytes += part.data.length;
      if (mediaBytes > MAX_TOTAL_MEDIA_BYTES) {
        throw new HttpError("Ukuran total foto melebihi batas.", 413);
      }
      // Namespace terpisah: dulu keduanya memakai `final-<n>.jpg`, sehingga
      // gif_photos menimpa photos pada indeks yang sama.
      const prefix =
        part.name === "photos" ? "final" : part.name === "gif_photos" ? "gif" : "gif-all";
      const file = join(dir, `${prefix}-${target.length}.jpg`);
      writeFileSync(file, part.data);
      target.push(file);
      continue;
    }
    if (!part.filename) fields[part.name] = part.data.toString("utf8");
  }

  if (photos.length === 0) throw new HttpError("Minimal satu foto wajib diunggah.", 400);

  const at = new Date(now).toISOString();
  const payloadPath = join(dir, "finalize.json");
  const payload = {
    session_id: id,
    retake_count: Number(fields.retake_count ?? 0),
    template_id: fields.template_id ?? null,
    photos,
    gif_photos: gifPhotos,
    gif_all_photos: gifAllPhotos,
    finalized_at: at,
  };
  writeFileSync(payloadPath, JSON.stringify(payload, null, 2));

  ctx.db
    .prepare(
      `insert into finalize_queue (id, session_id, payload_path, attempts, next_attempt_at, last_error, created_at)
       values (?, ?, ?, 0, ?, null, ?)`
    )
    .run(`fq_${id}`, id, payloadPath, at, at);
  ctx.db
    .prepare(
      "update sessions set state = 'finalized', retake_count = ?, updated_at = ? where id = ?"
    )
    .run(payload.retake_count, at, id);

  return {
    status: 200,
    body: { ok: true, session: present(requireSession(ctx.db, id)), photos: photos.length },
  };
}

/** POST /v1/sessions/:id/abort */
export function abortSession(ctx: SessionContext, id: string) {
  const row = requireSession(ctx.db, id);
  if (row.state === "aborted") {
    return { status: 200, body: { ok: true, replay: true, session: present(row) } };
  }
  requireActive(row);
  ctx.db
    .prepare("update sessions set state = 'aborted', updated_at = ? where id = ?")
    .run(nowIso(ctx), id);
  return { status: 200, body: { ok: true, session: present(requireSession(ctx.db, id)) } };
}

/** Router `/v1/sessions*`. `null` = bukan rute sesi. */
export function handleSessionRoute(
  ctx: SessionContext,
  method: string,
  pathname: string,
  headers: { idempotencyKey?: string },
  readBody: () => Promise<unknown>,
  readRawBody: () => Promise<Buffer>,
  contentType: string
): Promise<RouteResult> {
  return route();

  async function route(): Promise<RouteResult> {
    if (method === "POST" && pathname === "/v1/sessions") {
      return createSession(ctx, await readBody());
    }
    const match = /^\/v1\/sessions\/([^/]+)(\/capture|\/finalize|\/abort)?$/.exec(pathname);
    if (!match) return null;
    const id = decodeURIComponent(match[1] ?? "");
    const action = match[2] ?? "";

    if (method === "GET" && !action) return readSession(ctx, id);
    if (method !== "POST") return null;
    if (action === "/capture") {
      const raw = await readBody().catch(() => null);
      return captureSlot(ctx, id, headers.idempotencyKey, raw);
    }
    if (action === "/abort") return abortSession(ctx, id);
    if (action === "/finalize") {
      const raw = await readRawBody();
      return finalizeSession(ctx, id, parseMultipart(raw, contentType));
    }
    return null;
  }
}
