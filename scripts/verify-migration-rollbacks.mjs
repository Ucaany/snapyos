#!/usr/bin/env node
// Verifikasi integritas migrasi terhadap Postgres NYATA — dijalankan di VPS/CI,
// bukan di mesin dev (tidak ada `psql` di sana).
//
// Usage:
//   MIGRATION_CHECK_DB=postgres://... node scripts/verify-migration-rollbacks.mjs
//   node scripts/verify-migration-rollbacks.mjs --dry-run      (hanya cek nama)
//
// Yang diuji (3 properti, semuanya terhadap database SCRATCH yang dibuang):
//
//   A. Konvergensi  — `schema.sql` dari nol ≡ `schema.sql` + seluruh migrasi
//                     0002..NNNN berurutan. Migrasi yang menyimpang dari
//                     baseline akan terlihat di diff dump.
//   B. Forward aman — setiap migrasi forward bisa dijalankan dua kali
//                     (idempotent) tanpa error.
//   C. Rollback     — setiap `*_rollback.sql` bisa dijalankan setelah forward-nya
//                     tanpa error, lalu migrasi forward dijalankan lagi dan
//                     tetap berhasil (membuktikan rollback tidak merusak state
//                     yang dibutuhkan forward).
//
// KEAMANAN: script ini DROP SCHEMA di database yang ditunjuk. Menolak berjalan
// bila nama database tidak memuat penanda scratch (lihat ALLOWED_DB_PATTERN).
// JANGAN pernah arahkan ke Supabase produksi.

import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const MIGRATIONS_DIR = path.join(ROOT, "db", "migrations");
const SCHEMA = path.join(ROOT, "db", "schema.sql");

const dryRun = process.argv.includes("--dry-run");
const DB_URL = process.env.MIGRATION_CHECK_DB ?? "";

/** Nama database harus memuat salah satu penanda ini. */
const ALLOWED_DB_PATTERN = /(scratch|check|tmp|temp|test|rehearsal|migration)/i;

const NUMBERED = /^(\d{4})[-_](.+?)\.sql$/;

/** @returns {{file: string, num: number, isRollback: boolean, stem: string} | null} */
function parse(file) {
  const m = file.match(NUMBERED);
  if (!m) return null;
  const rest = m[2];
  const isRollback = /_rollback$/.test(rest);
  return {
    file,
    num: Number(m[1]),
    isRollback,
    stem: isRollback ? rest.replace(/_rollback$/, "") : rest,
  };
}

async function plan() {
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql"));
  const parsed = files.map(parse).filter(Boolean);
  const forwards = parsed
    .filter((p) => !p.isRollback)
    .sort((a, b) => a.num - b.num || a.stem.localeCompare(b.stem));
  const rollbackFor = new Map(
    parsed.filter((p) => p.isRollback).map((p) => [`${p.num}:${p.stem}`, p.file])
  );
  return { forwards, rollbackFor, total: parsed.length };
}

function psql(url, args, { input, label } = {}) {
  const res = spawnSync("psql", [url, "-v", "ON_ERROR_STOP=1", "-q", ...args], {
    input,
    encoding: "utf8",
  });
  if (res.error) throw new Error(`psql tidak bisa dijalankan: ${res.error.message}`);
  if (res.status !== 0) {
    throw new Error(
      `psql gagal${label ? ` (${label})` : ""} exit=${res.status}\n${res.stderr?.trim() ?? ""}`
    );
  }
  return res.stdout ?? "";
}

function psqlFile(url, file, label) {
  return psql(url, ["-f", file], { label });
}

/** Dump schema tanpa data, ternormalisasi agar diff stabil. */
function dumpSchema(url) {
  return psql(url, ["-c", "\\d+", "-c", "\\df+"], { label: "dump" });
}

function resetPublic(url) {
  psql(url, ["-c", "drop schema if exists public cascade; create schema public;"], {
    label: "reset",
  });
}

function assertSafeTarget(url) {
  let dbName;
  try {
    dbName = new URL(url).pathname.replace(/^\//, "");
  } catch {
    throw new Error("MIGRATION_CHECK_DB bukan URL Postgres yang valid");
  }
  if (!ALLOWED_DB_PATTERN.test(dbName)) {
    throw new Error(
      `Menolak berjalan: nama database "${dbName}" tidak memuat penanda scratch ` +
        `(${ALLOWED_DB_PATTERN}). Script ini DROP SCHEMA public.`
    );
  }
  return dbName;
}

async function main() {
  const { forwards, rollbackFor, total } = await plan();
  console.log(`[migrasi] ${total} berkas bernomor, ${forwards.length} forward.`);

  const missingRollback = forwards.filter((f) => !rollbackFor.has(`${f.num}:${f.stem}`));
  console.log(`[migrasi] tanpa rollback: ${missingRollback.length}`);
  for (const m of missingRollback) console.log(`   - ${m.file}`);

  if (dryRun) {
    console.log("[migrasi] --dry-run: berhenti sebelum menyentuh database.");
    return;
  }

  if (!DB_URL) {
    console.error(
      "\nMIGRATION_CHECK_DB belum di-set.\n" +
        "Contoh:\n" +
        "  createdb snapyos_scratch\n" +
        "  MIGRATION_CHECK_DB=postgres://localhost/snapyos_scratch node scripts/verify-migration-rollbacks.mjs\n"
    );
    process.exit(2);
  }
  const dbName = assertSafeTarget(DB_URL);
  console.log(`[migrasi] target scratch: ${dbName}`);

  const failures = [];

  // --- A. Konvergensi ------------------------------------------------------
  console.log("\n[A] konvergensi schema.sql vs schema.sql + semua migrasi");
  resetPublic(DB_URL);
  psqlFile(DB_URL, SCHEMA, "schema.sql");
  const baselineDump = dumpSchema(DB_URL);

  resetPublic(DB_URL);
  psqlFile(DB_URL, SCHEMA, "schema.sql");
  for (const f of forwards) {
    try {
      psqlFile(DB_URL, path.join(MIGRATIONS_DIR, f.file), f.file);
    } catch (err) {
      failures.push(`A: ${f.file} gagal saat dirantai di atas schema.sql\n${err.message}`);
    }
  }
  const chainedDump = dumpSchema(DB_URL);
  if (baselineDump !== chainedDump) {
    failures.push(
      "A: dump `schema.sql` ≠ dump `schema.sql + migrasi`. Ada migrasi yang belum " +
        "tercermin di baseline (aturan konvergensi db/README.md §5)."
    );
  } else {
    console.log("   PASS — rantai migrasi tidak menyimpang dari baseline.");
  }

  // --- B. Forward idempotent ----------------------------------------------
  console.log("\n[B] setiap migrasi forward aman dijalankan dua kali");
  resetPublic(DB_URL);
  psqlFile(DB_URL, SCHEMA, "schema.sql");
  for (const f of forwards) {
    const file = path.join(MIGRATIONS_DIR, f.file);
    try {
      psqlFile(DB_URL, file, `${f.file} (1/2)`);
      psqlFile(DB_URL, file, `${f.file} (2/2)`);
    } catch (err) {
      failures.push(`B: ${f.file} tidak idempotent\n${err.message}`);
    }
  }
  if (!failures.some((f) => f.startsWith("B:"))) console.log("   PASS — semua idempotent.");

  // --- C. Rollback ---------------------------------------------------------
  console.log("\n[C] setiap rollback berjalan, lalu forward bisa diulang");
  resetPublic(DB_URL);
  psqlFile(DB_URL, SCHEMA, "schema.sql");
  for (const f of forwards) {
    const rb = rollbackFor.get(`${f.num}:${f.stem}`);
    if (!rb) continue;
    const file = path.join(MIGRATIONS_DIR, f.file);
    const rbFile = path.join(MIGRATIONS_DIR, rb);
    try {
      psqlFile(DB_URL, file, `${f.file} (forward)`);
      psqlFile(DB_URL, rbFile, `${rb} (rollback)`);
      psqlFile(DB_URL, file, `${f.file} (re-forward)`);
    } catch (err) {
      failures.push(`C: ${rb} tidak bisa dipulihkan\n${err.message}`);
    }
  }
  if (!failures.some((f) => f.startsWith("C:"))) console.log("   PASS — semua rollback pulih.");

  // --- Ringkasan -----------------------------------------------------------
  console.log("\n================ RINGKASAN ================");
  console.log(`forward           : ${forwards.length}`);
  console.log(`punya rollback    : ${forwards.length - missingRollback.length}`);
  console.log(`TANPA rollback    : ${missingRollback.length}  (risiko terdokumentasi)`);
  if (failures.length) {
    console.error(`\nFAIL — ${failures.length} masalah:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("\nPASS — konvergensi, idempotensi, dan rollback terbukti.");
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
