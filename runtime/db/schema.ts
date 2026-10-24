/**
 * Skema store lokal runtime photobooth.
 *
 * Migrasi dijaga `PRAGMA user_version`: menjalankan `migrate()` dua kali tidak
 * melakukan apa pun pada kali kedua. `if not exists` tetap dipakai sebagai sabuk
 * kedua — DB yang dibuat versi lebih lama tidak boleh gagal hanya karena tabelnya
 * sudah ada.
 */

import type { DatabaseSync } from "node:sqlite";

/** Versi skema saat ini. Naikkan saat ada migrasi baru. */
export const SCHEMA_VERSION = 1;

/** Tabel yang ikut export/import setelan. PIN darurat sengaja TIDAK di sini. */
const MIGRATION_1 = `
create table if not exists device_settings (
  key text primary key,
  value_json text not null,
  updated_at text not null
);

create table if not exists sessions (
  id text primary key,
  cloud_id text,
  business_slug text not null,
  photobox_slug text not null,
  package_id text not null,
  template_id text,
  state text not null,
  expires_at text not null,
  retake_count integer not null default 0,
  package_snapshot_json text not null,
  payment_method text,
  client_created_at text not null,
  synced_at text,
  created_at text not null,
  updated_at text not null
);
create index if not exists idx_sessions_state on sessions (state, expires_at);
create index if not exists idx_sessions_unsynced on sessions (created_at) where synced_at is null;

create table if not exists captures (
  id text primary key,
  session_id text not null references sessions (id) on delete cascade,
  slot_index integer not null,
  file_path text not null,
  created_at text not null,
  unique (session_id, slot_index)
);

create table if not exists finalize_queue (
  id text primary key,
  session_id text not null unique references sessions (id) on delete cascade,
  payload_path text not null,
  attempts integer not null default 0,
  next_attempt_at text not null,
  last_error text,
  created_at text not null
);
create index if not exists idx_finalize_due on finalize_queue (next_attempt_at);

create table if not exists events (
  id integer primary key autoincrement,
  at text not null,
  kind text not null,
  session_id text,
  detail_json text
);
create index if not exists idx_events_at on events (at);
create index if not exists idx_events_kind on events (kind, at);

create table if not exists meta (
  key text primary key,
  value text not null
);
`;

/** Migrasi berurutan; indeks array + 1 = versi skema. */
const MIGRATIONS: readonly string[] = [MIGRATION_1];

export function readVersion(db: DatabaseSync): number {
  const row = db.prepare("pragma user_version").get() as { user_version?: number } | undefined;
  return Number(row?.user_version ?? 0);
}

/**
 * Jalankan migrasi yang belum diterapkan. Idempoten: dipanggil berkali-kali
 * pada DB yang sudah mutakhir tidak mengeksekusi SQL apa pun.
 */
export function migrate(db: DatabaseSync): number {
  let version = readVersion(db);
  while (version < SCHEMA_VERSION) {
    const sql = MIGRATIONS[version];
    if (!sql) throw new Error(`Migrasi skema ${version + 1} tidak ditemukan.`);
    db.exec("begin");
    try {
      db.exec(sql);
      version += 1;
      db.exec(`pragma user_version = ${version}`);
      db.exec("commit");
    } catch (error) {
      db.exec("rollback");
      throw error;
    }
  }
  return version;
}
