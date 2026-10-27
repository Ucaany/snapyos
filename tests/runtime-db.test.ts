/**
 * Phase 1 — store lokal SQLite.
 *
 * Yang diuji hanya janji yang dipakai fase berikutnya: migrasi idempoten,
 * data bertahan setelah proses mati, satu foto per slot, dan export tidak
 * pernah membawa kunci `exit_pin_*`.
 *
 * Run: npm test
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DB_FILE,
  SCHEMA_VERSION,
  closeDatabase,
  exportStore,
  getMeta,
  getSetting,
  insertSession,
  migrate,
  openDatabase,
  readVersion,
  setMeta,
  setSetting,
} from "../runtime/db/index.ts";

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "snapyos-db-"));
}

test("migrasi dijalankan 2x tetap idempoten", () => {
  const dir = tempDir();
  try {
    const db = openDatabase(dir);
    assert.equal(readVersion(db), SCHEMA_VERSION);
    // Kali kedua: tidak melempar, versi tidak berubah.
    assert.equal(migrate(db), SCHEMA_VERSION);
    assert.equal(migrate(db), SCHEMA_VERSION);
    setSetting(db, "camera", { width: 1920 });
    assert.deepEqual(getSetting(db, "camera"), { width: 1920 });
    closeDatabase(db);

    // Buka ulang dari nol juga tidak boleh menjalankan ulang DDL destruktif.
    const again = openDatabase(dir);
    assert.equal(readVersion(again), SCHEMA_VERSION);
    assert.deepEqual(getSetting(again, "camera"), { width: 1920 });
    closeDatabase(again);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("baris bertahan setelah proses penulis mati", () => {
  const dir = tempDir();
  try {
    // Proses terpisah menulis lalu exit — bukan sekadar close() di proses yang sama.
    execFileSync(
      process.execPath,
      [
        "--experimental-strip-types",
        "--input-type=module",
        "-e",
        `import { openDatabase, setSetting, setMeta, insertSession, closeDatabase } from ${JSON.stringify(
          new URL("../runtime/db/index.ts", import.meta.url).href
        )};
         const db = openDatabase(${JSON.stringify(dir)});
         setSetting(db, "printer", { name: "DNP" });
         setMeta(db, "photobox_slug", "booth-a");
         insertSession(db, {
           id: "local_abc", businessSlug: "biz", photoboxSlug: "booth-a",
           packageId: "pkg", packageSnapshot: { price: 25000 }, timerSeconds: 60,
         });
         closeDatabase(db);`,
      ],
      { stdio: "pipe" }
    );

    const db = openDatabase(dir);
    assert.deepEqual(getSetting(db, "printer"), { name: "DNP" });
    assert.equal(getMeta(db, "photobox_slug"), "booth-a");
    const row = db.prepare("select id, state, expires_at from sessions").get() as {
      id: string;
      state: string;
      expires_at: string;
    };
    assert.equal(row.id, "local_abc");
    assert.equal(row.state, "active");
    assert.ok(Date.parse(row.expires_at) > Date.now() - 5_000, "expires_at dari computeExpiresAt");
    closeDatabase(db);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("UNIQUE(session_id, slot_index) menolak duplikat", () => {
  const dir = tempDir();
  try {
    const db = openDatabase(dir);
    insertSession(db, {
      id: "local_dup",
      businessSlug: "biz",
      photoboxSlug: "booth-a",
      packageId: "pkg",
      packageSnapshot: {},
      timerSeconds: 60,
    });
    const insert = db.prepare(
      "insert into captures (id, session_id, slot_index, file_path, created_at) values (?, ?, ?, ?, ?)"
    );
    const at = new Date().toISOString();
    insert.run("cap_1", "local_dup", 0, "/data/1.jpg", at);
    assert.throws(
      () => insert.run("cap_2", "local_dup", 0, "/data/2.jpg", at),
      /UNIQUE|constraint/i
    );
    // Slot lain tetap boleh.
    insert.run("cap_3", "local_dup", 1, "/data/3.jpg", at);
    assert.equal((db.prepare("select count(*) as n from captures").get() as { n: number }).n, 2);
    closeDatabase(db);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("export membuang semua kunci exit_pin_", () => {
  const dir = tempDir();
  try {
    const db = openDatabase(dir);
    setSetting(db, "session", { timer_seconds: 300 });
    setMeta(db, "photobox_slug", "booth-a");
    setMeta(db, "business_slug", "biz");
    setMeta(db, "exit_pin_emergency_hash", "$argon2id$v=19$...");
    setMeta(db, "exit_pin_failed_count", "3");
    setMeta(db, "exit_pin_locked_until", "2026-01-01T00:00:00.000Z");

    const exported = exportStore(db);
    assert.deepEqual(Object.keys(exported.meta).sort(), ["business_slug", "photobox_slug"]);
    assert.deepEqual(exported.device_settings, { session: { timer_seconds: 300 } });
    assert.equal(exported.schema_version, SCHEMA_VERSION);
    assert.ok(
      !JSON.stringify(exported).includes("exit_pin_"),
      "tidak ada jejak exit_pin_ di export"
    );

    // Hash tetap ada di DB — hanya export yang membuangnya.
    assert.equal(getMeta(db, "exit_pin_emergency_hash"), "$argon2id$v=19$...");
    closeDatabase(db);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("berkas DB memakai WAL dan bernama tetap di data dir", () => {
  const dir = tempDir();
  try {
    const db = openDatabase(dir);
    const mode = db.prepare("pragma journal_mode").get() as { journal_mode: string };
    assert.equal(mode.journal_mode, "wal");
    closeDatabase(db);
    assert.ok(join(dir, DB_FILE).length > 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
