/**
 * Phase 2 — endpoint sesi lokal + PIN darurat.
 *
 * Yang diuji hanya janji yang dipakai kiosk: capture idempoten, finalize
 * tersimpan, abort mengubah state, status memuat slug booth, dan PIN darurat
 * mengunci setelah 5 salah. Runtime dijalankan sebagai proses nyata karena bug
 * yang mahal justru ada di lapisan HTTP-nya.
 *
 * Run: npm test
 */

import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { hashDevicePin } from "../src/lib/device-token.ts";
import { closeDatabase, openDatabase, setMeta } from "../runtime/db/index.ts";

const TOKEN = "test-bridge-token-0123456789";
const auth = { "x-bridge-token": TOKEN };
const EMERGENCY_PIN = "482913";

let dir = "";
let base = "";
let child: ChildProcess | null = null;

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const chosen = typeof address === "object" && address ? address.port : 0;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
  return chosen;
}

async function waitForHealth(): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${base}/health`)).ok) return;
    } catch {
      // belum bind
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Runtime tidak start dalam 15 detik.");
}

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${base}${path}`, {
    ...init,
    headers: { ...auth, ...(init.headers as Record<string, string> | undefined) },
  });
}

async function newSession(): Promise<string> {
  const res = await call("/v1/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      package_snapshot: { id: "pkg-1", name: "Paket A", price: 35000, copies: 2 },
      timer_seconds: 300,
    }),
  });
  assert.equal(res.status, 201);
  const body = (await res.json()) as { id: string };
  assert.match(body.id, /^local_/);
  return body.id;
}

before(async () => {
  dir = mkdtempSync(join(tmpdir(), "snapyos-session-"));
  // Seed meta SEBELUM runtime start: slug + hash PIN darurat hanya diisi saat
  // instalasi, bukan oleh endpoint mana pun.
  const db = openDatabase(dir);
  setMeta(db, "business_slug", "snapy-demo");
  setMeta(db, "photobox_slug", "booth-01");
  setMeta(db, "exit_pin_emergency_hash", await hashDevicePin(EMERGENCY_PIN));
  closeDatabase(db);

  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, [join(process.cwd(), "scripts/photobooth-bridge.mjs")], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PHOTOBOOTH_BRIDGE_PORT: String(port),
      PHOTOBOOTH_BRIDGE_TOKEN: TOKEN,
      SNAPYOS_DATA_DIR: dir,
      SNAPYOS_CAMERA: "mock",
      SNAPYOS_PRINTER: "mock",
      SNAPYOS_ALLOW_MOCK: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await waitForHealth();
});

after(async () => {
  if (child && child.exitCode === null) {
    child.kill("SIGTERM");
    await once(child, "exit");
  }
  rmSync(dir, { recursive: true, force: true });
});

test("/v1/status memuat slug dari meta", async () => {
  const res = await call("/v1/status");
  const body = (await res.json()) as Record<string, unknown>;
  assert.equal(body.business_slug, "snapy-demo");
  assert.equal(body.photobox_slug, "booth-01");
  assert.equal(body.db_version, 2);
});

test("POST /v1/sessions menolak tanpa package_snapshot", async () => {
  const res = await call("/v1/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ package_id: "pkg-1" }),
  });
  assert.equal(res.status, 400);
});

test("capture dengan Idempotency-Key sama menghasilkan satu baris", async () => {
  const id = await newSession();
  const headers = { "Content-Type": "application/json", "Idempotency-Key": "slot-0-attempt-1" };
  const first = await call(`/v1/sessions/${id}/capture`, {
    method: "POST",
    headers,
    body: JSON.stringify({ slot_index: 0 }),
  });
  assert.equal(first.status, 201);
  const second = await call(`/v1/sessions/${id}/capture`, {
    method: "POST",
    headers,
    body: JSON.stringify({ slot_index: 0 }),
  });
  assert.equal(second.status, 200);
  assert.equal(((await second.json()) as { replay?: boolean }).replay, true);

  const read = await call(`/v1/sessions/${id}`);
  const body = (await read.json()) as { captures: unknown[] };
  assert.equal(body.captures.length, 1);
});

test("capture tanpa Idempotency-Key ditolak", async () => {
  const id = await newSession();
  const res = await call(`/v1/sessions/${id}/capture`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slot_index: 0 }),
  });
  assert.equal(res.status, 400);
});

test("finalize multipart tersimpan ke antrean", async () => {
  const id = await newSession();
  const form = new FormData();
  form.append("device_token", "x".repeat(40));
  form.append("retake_count", "1");
  form.append("photos", new Blob([Buffer.from([0xff, 0xd8, 0xff, 0xd9])]), "photo.jpg");

  const res = await call(`/v1/sessions/${id}/finalize`, { method: "POST", body: form });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { session: { state: string }; photos: number };
  assert.equal(body.photos, 1);
  assert.equal(body.session.state, "finalized");

  const db = openDatabase(dir);
  try {
    const row = db
      .prepare("select payload_path from finalize_queue where session_id = ?")
      .get(id) as { payload_path: string } | undefined;
    assert.ok(row?.payload_path);
  } finally {
    closeDatabase(db);
  }
});

test("abort mengubah state dan menolak capture berikutnya", async () => {
  const id = await newSession();
  const res = await call(`/v1/sessions/${id}/abort`, { method: "POST" });
  assert.equal(res.status, 200);
  assert.equal(((await res.json()) as { session: { state: string } }).session.state, "aborted");

  const again = await call(`/v1/sessions/${id}/capture`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": "after-abort" },
    body: JSON.stringify({ slot_index: 0 }),
  });
  assert.equal(again.status, 409);
});

test("ID cloud (UUID) tidak pernah dilayani sebagai sesi lokal", async () => {
  const res = await call("/v1/sessions/8f14e45f-ceea-467f-a8f5-1b1e2f5e2a11");
  assert.equal(res.status, 404);
});

test("/v1/exit menolak tanpa token bridge", async () => {
  const res = await fetch(`${base}/v1/exit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin: EMERGENCY_PIN }),
  });
  assert.equal(res.status, 401);
});

test("PIN salah 5x mengunci, PIN benar tetap ditolak saat terkunci", async () => {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const res = await call("/v1/exit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: "000000" }),
    });
    assert.equal(res.status, 403);
  }
  const fifth = await call("/v1/exit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin: "000000" }),
  });
  assert.equal(fifth.status, 429);

  const correct = await call("/v1/exit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin: EMERGENCY_PIN }),
  });
  assert.equal(correct.status, 429);
});

test("PIN benar mencatat events exit_pin_emergency_used", async () => {
  // Buka kunci dari tes sebelumnya (mensimulasikan 5 menit lewat).
  const db = openDatabase(dir);
  db.prepare("update meta set value = '' where key = 'exit_pin_locked_until'").run();
  db.prepare("update meta set value = '0' where key = 'exit_pin_failed_count'").run();
  closeDatabase(db);

  const res = await call("/v1/exit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin: EMERGENCY_PIN }),
  });
  assert.equal(res.status, 200);

  const reopened = openDatabase(dir);
  try {
    const row = reopened
      .prepare("select count(*) as n from events where kind = 'exit_pin_emergency_used'")
      .get() as { n: number };
    assert.equal(row.n, 1);
  } finally {
    closeDatabase(reopened);
  }
});
