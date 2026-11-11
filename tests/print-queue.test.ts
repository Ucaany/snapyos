import test from "node:test";
import assert from "node:assert/strict";

import { closeDatabase, openDatabase } from "../runtime/db/index.ts";
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
  sheetHash,
} from "../runtime/print/jobs.ts";

function setup() {
  const db = openDatabase(":memory:");
  return { db, close: () => closeDatabase(db) };
}

const sheets = [["aaa", "bbb"]];

test("dedupe default stabil untuk payload sama", () => {
  assert.equal(defaultDedupeKey("local_1", sheets), defaultDedupeKey("local_1", sheets));
  assert.notEqual(defaultDedupeKey("local_1", sheets), defaultDedupeKey("local_2", sheets));
  assert.notEqual(defaultDedupeKey("local_1", sheets), defaultDedupeKey("local_1", [["ccc"]]));
  assert.equal(sheetHash(sheets).length, 32);
});

test("insertPrintJob idempoten per dedupe_key", () => {
  const { db, close } = setup();
  try {
    const first = insertPrintJob(db, {
      dedupeKey: "s1:hash",
      sessionId: "local_1",
      mode: "cups",
      copies: 1,
      sheets: 1,
      printerName: "DNP",
    });
    const second = insertPrintJob(db, {
      dedupeKey: "s1:hash",
      sessionId: "local_1",
      mode: "cups",
      copies: 1,
      sheets: 1,
    });
    assert.equal(first.id, second.id);
    assert.equal(listPrintJobs(db).length, 1);
    assert.equal(findPrintJob(db, "s1:hash")?.id, first.id);
  } finally {
    close();
  }
});

test("status queued → printing → submitted → done (konfirmasi operator)", () => {
  const { db, close } = setup();
  try {
    const job = insertPrintJob(db, { dedupeKey: "k", mode: "cups", copies: 1, sheets: 1 });
    assert.equal(job.status, "queued");
    markPrinting(db, job.id);
    let row = getPrintJob(db, job.id)!;
    assert.equal(row.status, "printing");
    assert.equal(row.attempts, 1);
    markSubmitted(db, job.id, "PRINTER-7");
    row = getPrintJob(db, job.id)!;
    assert.equal(row.status, "submitted");
    assert.equal(row.spool_job_id, "PRINTER-7");
    const done = confirmPrintJob(db, job.id)!;
    assert.equal(done.status, "done");
  } finally {
    close();
  }
});

test("failed → requeue → queued; stats menghitung antrean & retry", () => {
  const { db, close } = setup();
  try {
    const job = insertPrintJob(db, { dedupeKey: "r", mode: "cups", copies: 1, sheets: 1 });
    markPrinting(db, job.id);
    markFailed(db, job.id, "lp: printer disabled");
    const failed = getPrintJob(db, job.id)!;
    assert.equal(failed.status, "failed");
    assert.match(String(failed.error), /disabled/);

    const stats = printJobStats(db);
    assert.equal(stats.status, "failed");
    assert.equal(stats.queue_retrying, 1);
    assert.equal(stats.queue_pending, 0);
    assert.match(String(stats.last_error), /disabled/);

    const queued = requeuePrintJob(db, job.id)!;
    assert.equal(queued.status, "queued");
    assert.equal(queued.error, null);
  } finally {
    close();
  }
});

test("health gagal (submit error) menandai job failed, bukan submitted", () => {
  const { db, close } = setup();
  try {
    const job = insertPrintJob(db, { dedupeKey: "h", mode: "cups", copies: 1, sheets: 1 });
    markPrinting(db, job.id);
    markFailed(db, job.id, "Printer default CUPS belum diatur");
    const row = getPrintJob(db, job.id)!;
    assert.equal(row.status, "failed");
    assert.equal(row.spool_job_id, null);
  } finally {
    close();
  }
});
