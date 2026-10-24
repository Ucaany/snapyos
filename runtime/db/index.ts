/**
 * Store lokal runtime photobooth (SQLite via `node:sqlite`).
 *
 * Satu berkas `snapyos.db` di data dir. WAL supaya penulisan sesi tidak
 * memblokir pembacaan status saat booth sedang dipakai.
 *
 * Isi modul ini sengaja tipis: buka/migrasi + akses setelan/meta + export.
 * Penulisan sesi/capture diserahkan ke pemanggil (Phase 2) agar tidak ada
 * lapisan repository yang harus dirawat sebelum ada konsumennya.
 */

import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { computeExpiresAt } from "../../src/lib/session-timer.ts";
import { migrate, readVersion } from "./schema.ts";

export type { DatabaseSync } from "node:sqlite";
export { SCHEMA_VERSION, migrate, readVersion } from "./schema.ts";

export const DB_FILE = "snapyos.db";

/** Awalan kunci meta yang tidak boleh keluar dari mesin (hash PIN darurat + rate-limit). */
export const SECRET_KEY_PREFIX = "exit_pin_";

export function isSecretKey(key: string): boolean {
  return key.startsWith(SECRET_KEY_PREFIX);
}

export type StoreExport = {
  schema_version: number;
  device_settings: Record<string, unknown>;
  meta: Record<string, string>;
};

function openRaw(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  // FK ditegakkan supaya captures/finalize_queue tidak bisa yatim.
  db.exec("pragma foreign_keys = on");
  return db;
}

/**
 * Buka (dan buat bila perlu) store di `<dataDir>/snapyos.db`.
 * Migrasi dijalankan di sini, jadi setiap pemanggil mendapat skema mutakhir.
 */
export function openDatabase(dataDir: string): DatabaseSync {
  if (dataDir === ":memory:") {
    const memory = openRaw(dataDir);
    migrate(memory);
    return memory;
  }
  const path = dataDir.endsWith(DB_FILE) ? dataDir : `${dataDir}/${DB_FILE}`;
  mkdirSync(dirname(path), { recursive: true });
  const db = openRaw(path);
  // WAL: pembaca tidak menunggu penulis. NORMAL cukup — kehilangan transaksi
  // terakhir saat listrik mati masih bisa dipulihkan dari WAL.
  db.exec("pragma journal_mode = wal");
  db.exec("pragma synchronous = normal");
  migrate(db);
  return db;
}

export function closeDatabase(db: DatabaseSync): void {
  if (db.isOpen) db.close();
}

// --- device_settings ---

export function getSetting<T = unknown>(db: DatabaseSync, key: string): T | null {
  const row = db.prepare("select value_json from device_settings where key = ?").get(key) as
    | { value_json: string }
    | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.value_json) as T;
  } catch {
    // Baris rusak tidak boleh menjatuhkan runtime; anggap belum di-set.
    return null;
  }
}

export function setSetting(db: DatabaseSync, key: string, value: unknown): void {
  db.prepare(
    `insert into device_settings (key, value_json, updated_at) values (?, ?, ?)
     on conflict (key) do update set value_json = excluded.value_json, updated_at = excluded.updated_at`
  ).run(key, JSON.stringify(value), new Date().toISOString());
}

export function listSettings(db: DatabaseSync): Record<string, unknown> {
  const rows = db.prepare("select key, value_json from device_settings order by key").all() as {
    key: string;
    value_json: string;
  }[];
  const out: Record<string, unknown> = {};
  for (const row of rows) {
    try {
      out[row.key] = JSON.parse(row.value_json);
    } catch {
      // lewati baris rusak
    }
  }
  return out;
}

// --- meta ---

export function getMeta(db: DatabaseSync, key: string): string | null {
  const row = db.prepare("select value from meta where key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setMeta(db: DatabaseSync, key: string, value: string): void {
  db.prepare(
    `insert into meta (key, value) values (?, ?)
     on conflict (key) do update set value = excluded.value`
  ).run(key, value);
}

export function deleteMeta(db: DatabaseSync, key: string): void {
  db.prepare("delete from meta where key = ?").run(key);
}

// --- sessions ---

export type NewSession = {
  id: string;
  businessSlug: string;
  photoboxSlug: string;
  packageId: string;
  templateId?: string | null;
  packageSnapshot: unknown;
  paymentMethod?: string | null;
  /** Timer dari setelan device; `expires_at` dihitung, bukan dikirim kiosk. */
  timerSeconds: number;
  clientCreatedAt?: string;
};

/** Sesi lokal baru berstatus `active`. ID wajib berprefix `local_` (dijaga pemanggil). */
export function insertSession(db: DatabaseSync, input: NewSession, now = Date.now()): string {
  const at = new Date(now).toISOString();
  db.prepare(
    `insert into sessions (
       id, cloud_id, business_slug, photobox_slug, package_id, template_id, state,
       expires_at, retake_count, package_snapshot_json, payment_method,
       client_created_at, synced_at, created_at, updated_at
     ) values (?, null, ?, ?, ?, ?, 'active', ?, 0, ?, ?, ?, null, ?, ?)`
  ).run(
    input.id,
    input.businessSlug,
    input.photoboxSlug,
    input.packageId,
    input.templateId ?? null,
    computeExpiresAt(input.timerSeconds, now),
    JSON.stringify(input.packageSnapshot),
    input.paymentMethod ?? null,
    input.clientCreatedAt ?? at,
    at,
    at
  );
  return input.id;
}

// --- events ---

/** Catatan kejadian lokal (mis. `exit_pin_emergency_used`). Tidak pernah gagal keras. */
export function insertEvent(
  db: DatabaseSync,
  kind: string,
  sessionId: string | null = null,
  detail: unknown = null
): void {
  db.prepare(
    "insert into events (at, kind, session_id, detail_json) values (?, ?, ?, ?)"
  ).run(new Date().toISOString(), kind, sessionId, detail === null ? null : JSON.stringify(detail));
}

// --- export ---

/**
 * Export setelan untuk dipindah ke booth lain.
 * Semua kunci `exit_pin_*` (hash PIN darurat + rate-limit lokal) dibuang:
 * PIN darurat terikat ke mesin, bukan ke konfigurasi.
 */
export function exportStore(db: DatabaseSync): StoreExport {
  const meta: Record<string, string> = {};
  const rows = db.prepare("select key, value from meta order by key").all() as {
    key: string;
    value: string;
  }[];
  for (const row of rows) {
    if (!isSecretKey(row.key)) meta[row.key] = row.value;
  }
  return {
    schema_version: readVersion(db),
    device_settings: listSettings(db),
    meta,
  };
}

/**
 * Impor hasil `exportStore`. Kunci `exit_pin_*` diabaikan meski ada di payload —
 * menerimanya berarti PIN darurat booth A bisa dipakai di booth B.
 */
export function importStore(db: DatabaseSync, payload: StoreExport): void {
  db.exec("begin");
  try {
    for (const [key, value] of Object.entries(payload.device_settings ?? {})) {
      setSetting(db, key, value);
    }
    for (const [key, value] of Object.entries(payload.meta ?? {})) {
      if (!isSecretKey(key)) setMeta(db, key, value);
    }
    db.exec("commit");
  } catch (error) {
    db.exec("rollback");
    throw error;
  }
}
