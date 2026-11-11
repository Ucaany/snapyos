/**
 * Rekonsiliasi `storage_objects` vs listing bucket — koreksi `used_bytes`,
 * bukan hanya seed saat baris counter absen.
 *
 * Drift yang harus terkoreksi:
 *  - objek HANTU: ada di ledger, sudah tidak ada di bucket → counter terlalu
 *    besar (owner melihat "penuh" padahal kosong, dan blokir upload).
 *  - objek TAK TERCATAT: ada di bucket, tidak ada di ledger → counter terlalu
 *    kecil (kuota bisa dilanggar tanpa terdeteksi).
 *  - ukuran BERUBAH (objek ditimpa): counter memakai byte lama.
 *
 * Run: npm test
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  listingTotalBytes,
  planIsEmpty,
  planStorageReconcile,
  type ReconcileEntry,
} from "../src/lib/storage-reconcile.ts";

const BIZ = "biz-1";
const GEN = "generated-photos";
const ASSETS = "business-assets";

function entry(key: string, bytes: number, bucket = GEN): ReconcileEntry {
  return { key, bytes, bucket };
}

test("reconcile: ledger == listing → rencana kosong (idempotent, cron aman diulang)", () => {
  const ledger = [entry(`${BIZ}/a.jpg`, 100), entry(`${BIZ}/b.gif`, 200)];
  const plan = planStorageReconcile(ledger, ledger);
  assert.ok(planIsEmpty(plan));
  assert.deepEqual(plan, { add: [], remove: [], resize: [] });
});

test("reconcile: objek hantu di ledger (sudah hilang dari bucket) → remove", () => {
  const ledger = [entry(`${BIZ}/ada.jpg`, 100), entry(`${BIZ}/hantu.jpg`, 500)];
  const listing = [entry(`${BIZ}/ada.jpg`, 100)];
  const plan = planStorageReconcile(ledger, listing);
  assert.deepEqual(plan.remove, [`${BIZ}/hantu.jpg`]);
  assert.deepEqual(plan.add, []);
});

test("reconcile: objek tak tercatat di bucket → add (counter terlalu kecil)", () => {
  const ledger = [entry(`${BIZ}/lama.jpg`, 100)];
  const listing = [entry(`${BIZ}/lama.jpg`, 100), entry(`${BIZ}/baru.jpg`, 750)];
  const plan = planStorageReconcile(ledger, listing);
  assert.deepEqual(
    plan.add.map((e) => e.key),
    [`${BIZ}/baru.jpg`]
  );
  assert.equal(plan.add[0]!.bytes, 750);
  assert.deepEqual(plan.remove, []);
});

test("reconcile: ukuran berubah (objek ditimpa) → resize dengan byte baru", () => {
  const ledger = [entry(`${BIZ}/logo.png`, 100, ASSETS)];
  const listing = [entry(`${BIZ}/logo.png`, 400, ASSETS)];
  const plan = planStorageReconcile(ledger, listing);
  assert.deepEqual(
    plan.resize.map((e) => [e.key, e.bytes]),
    [[`${BIZ}/logo.png`, 400]]
  );
  assert.deepEqual(plan.add, []);
  assert.deepEqual(plan.remove, []);
});

test("reconcile: byte tidak valid dinormalkan 0 (tak merusak counter)", () => {
  const ledger = [entry(`${BIZ}/x.jpg`, Number.NaN)];
  const listing = [entry(`${BIZ}/x.jpg`, -10)];
  const plan = planStorageReconcile(ledger, listing);
  assert.ok(planIsEmpty(plan));
  assert.equal(listingTotalBytes(listing), 0);
});

test("reconcile: ledger kosong + bucket berisi → semua objek di-add", () => {
  const listing = [entry(`${BIZ}/a.jpg`, 10), entry(`${BIZ}/b.jpg`, 20)];
  const plan = planStorageReconcile([], listing);
  assert.equal(plan.add.length, 2);
  assert.equal(listingTotalBytes(listing), 30);
});

test("reconcile: bucket kosong + ledger berisi → semua entri dihapus", () => {
  const ledger = [entry(`${BIZ}/a.jpg`, 10), entry(`${BIZ}/b.gif`, 20)];
  const plan = planStorageReconcile(ledger, []);
  assert.deepEqual(plan.remove.sort(), [`${BIZ}/a.jpg`, `${BIZ}/b.gif`]);
});

test("reconcile: bucket campuran (add + remove + resize) sekaligus", () => {
  const ledger = [
    entry(`${BIZ}/tetap.jpg`, 100),
    entry(`${BIZ}/hantu.jpg`, 900),
    entry(`${BIZ}/berubah.jpg`, 50),
  ];
  const listing = [
    entry(`${BIZ}/tetap.jpg`, 100),
    entry(`${BIZ}/berubah.jpg`, 150),
    entry(`${BIZ}/baru.jpg`, 300),
  ];
  const plan = planStorageReconcile(ledger, listing);
  assert.deepEqual(plan.remove, [`${BIZ}/hantu.jpg`]);
  assert.deepEqual(
    plan.add.map((e) => e.key),
    [`${BIZ}/baru.jpg`]
  );
  assert.deepEqual(
    plan.resize.map((e) => e.key),
    [`${BIZ}/berubah.jpg`]
  );
});

test("source: reconcileBusinessStorage membandingkan ledger (bukan hanya seed)", async () => {
  const src = await readFile(new URL("../src/server/storage-usage.ts", import.meta.url), "utf8");
  const fn = src.slice(src.indexOf("export async function reconcileBusinessStorage"));
  assert.match(fn, /readLedgerEntries\(businessId\)/);
  assert.match(fn, /planStorageReconcile\(ledger, listing\)/);
  assert.match(fn, /accountStorageSub\(businessId, removable\)/);
  assert.match(fn, /accountStorageAdd\(businessId/);
  // Listing gagal untuk satu bucket → bucket itu tidak dikoreksi berdasarkan
  // listing parsial (mencegah under-count permanen).
  assert.match(fn, /failedBuckets/);
  assert.match(fn, /from\("storage_objects"\)/);
  assert.match(fn, /\.range\(offset, offset \+ pageSize - 1\)/);
});
