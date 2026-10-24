/**
 * Phase 3 — setelan device lewat runtime lokal.
 *
 * Yang diuji hanya janji yang dipakai kiosk dan operator: field cloud ditolak
 * (bukan dibuang diam-diam), export tidak pernah membawa PIN, impor menolak
 * berkas booth lain / versi lebih baru, dan merge tidak menimpa `copies`.
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
import { closeDatabase, openDatabase, setMeta, setSetting } from "../runtime/db/index.ts";
import { mergeSettings } from "../runtime/settings/index.ts";

const TOKEN = "test-bridge-token-0123456789";
const auth = { "x-bridge-token": TOKEN };

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

async function sendJson(method: string, path: string, body: unknown): Promise<Response> {
  return call(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

before(async () => {
  dir = mkdtempSync(join(tmpdir(), "snapyos-settings-"));
  const db = openDatabase(dir);
  setMeta(db, "business_slug", "snapy-demo");
  setMeta(db, "photobox_slug", "booth-01");
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

test("merge mempertahankan copies cloud saat device mengirim paper_size", () => {
  const merged = mergeSettings(
    {
      print_settings: { copies: 2, layout: "strip", printer_name: "Cloud" },
      payment_mode: "gateway",
    },
    { print_settings: { paper_size: "A6", printer_name: "Booth" } }
  );
  assert.deepEqual(merged.print_settings, {
    copies: 2,
    layout: "strip",
    paper_size: "A6",
    printer_name: "Booth",
  });
  assert.equal(merged.payment_mode, "gateway");
});

test("PUT field cloud ditolak 403, bukan diabaikan", async () => {
  const nested = await sendJson("PUT", "/v1/settings", { print_settings: { copies: 3 } });
  assert.equal(nested.status, 403);
  const nestedBody = (await nested.json()) as { error?: string };
  assert.equal(nestedBody.error, "FIELD_NOT_DEVICE_OWNED");

  const topLevel = await sendJson("PUT", "/v1/settings", { payment_mode: "voucher" });
  assert.equal(topLevel.status, 403);
  assert.equal(((await topLevel.json()) as { error?: string }).error, "FIELD_NOT_DEVICE_OWNED");
});

test("PUT field device tersimpan dan terbaca kembali", async () => {
  const res = await sendJson("PUT", "/v1/settings", {
    print_settings: { printer_name: "Snapy-01", paper_size: "A6", auto_print: true },
  });
  assert.equal(res.status, 200);

  const read = await call("/v1/settings");
  assert.equal(read.status, 200);
  const body = (await read.json()) as {
    photobox_slug: string;
    settings: { print_settings: Record<string, unknown> };
  };
  assert.equal(body.photobox_slug, "booth-01");
  assert.equal(body.settings.print_settings.printer_name, "Snapy-01");
  assert.equal(body.settings.print_settings.paper_size, "A6");
});

test("PUT nilai di luar kontrak validator ditolak 400", async () => {
  const res = await sendJson("PUT", "/v1/settings", {
    session_settings: { timer_seconds: 30 },
  });
  assert.equal(res.status, 400);
});

test("import versi lebih tinggi ditolak", async () => {
  const res = await sendJson("POST", "/v1/settings/import", {
    schema_version: 2,
    photobox_slug: "booth-01",
    settings: { camera_settings: { mirror_preview: true } },
  });
  assert.equal(res.status, 400);
  assert.equal(((await res.json()) as { error?: string }).error, "SCHEMA_VERSION_TOO_NEW");
});

test("import slug booth lain ditolak", async () => {
  const res = await sendJson("POST", "/v1/settings/import", {
    schema_version: 1,
    photobox_slug: "booth-02",
    settings: { camera_settings: { mirror_preview: true } },
  });
  assert.equal(res.status, 409);
  assert.equal(((await res.json()) as { error?: string }).error, "PHOTOBOX_MISMATCH");
});

test("import slug cocok diterapkan", async () => {
  const res = await sendJson("POST", "/v1/settings/import", {
    schema_version: 1,
    photobox_slug: "booth-01",
    settings: { session_settings: { timer_seconds: 180, warning_seconds: 30 } },
  });
  assert.equal(res.status, 200);

  const read = await call("/v1/settings");
  const body = (await read.json()) as {
    settings: { session_settings: Record<string, unknown> };
  };
  assert.equal(body.settings.session_settings.timer_seconds, 180);
});

test("export tanpa exit_pin dan ber-schema_version 1", async () => {
  const db = openDatabase(dir);
  try {
    setSetting(db, "session_settings", {
      timer_seconds: 120,
      exit_pin: "1234",
      exit_pin_emergency_hash: "$argon2id$...",
    });
  } finally {
    closeDatabase(db);
  }

  const res = await call("/v1/settings/export");
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.ok(!text.includes("exit_pin"), `export membawa kunci PIN: ${text}`);

  const active = await (await call("/v1/settings")).text();
  assert.ok(!active.includes("exit_pin"), `GET /v1/settings membawa kunci PIN: ${active}`);
  const body = JSON.parse(text) as {
    schema_version: number;
    photobox_slug: string;
    settings: { session_settings: Record<string, unknown> };
  };
  assert.equal(body.schema_version, 1);
  assert.equal(body.photobox_slug, "booth-01");
  assert.equal(body.settings.session_settings.timer_seconds, 120);
});
