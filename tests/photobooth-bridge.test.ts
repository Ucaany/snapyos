import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { tmpdir } from "node:os";
import { test } from "node:test";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const bridge = join(root, "scripts", "photobooth-bridge.mjs");
const pngBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const TEST_TOKEN = "test-bridge-token-0123456789";
const auth = { "x-bridge-token": TEST_TOKEN };

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
  return port;
}

async function writeExecutable(path: string, source: string): Promise<void> {
  await writeFile(path, `#!/bin/sh\nset -eu\n${source}\n`, { mode: 0o700 });
}

async function stop(processHandle: ChildProcess): Promise<void> {
  if (processHandle.exitCode !== null) return;
  processHandle.kill("SIGTERM");
  await once(processHandle, "exit");
}

async function waitForHealth(baseUrl: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {
      // Bridge mungkin belum selesai bind port.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Bridge tidak berhasil start dalam 10 detik.");
}

test("photobooth bridge menjalankan capture ter-queue dan CUPS dengan geometry presisi", async () => {
  const directory = await mkdtemp(join(tmpdir(), "snapyos-bridge-test-"));
  const gphotoLog = join(directory, "gphoto.log");
  const lpLog = join(directory, "lp.log");
  const gphoto = join(directory, "gphoto2");
  const lpstat = join(directory, "lpstat");
  const lp = join(directory, "lp");
  const port = await freePort();

  await writeExecutable(
    gphoto,
    `printf '%s\\n' "$*" >> "$FAKE_GPHOTO_LOG"
case "\${1-}" in
  --auto-detect)
    printf '%s\\n' 'Model Port' 'Fake DSLR usb:001,002'
    ;;
  --capture-preview)
    printf '\\377\\330\\377\\331'
    ;;
  *)
    output=''
    for argument in "$@"; do
      case "$argument" in
        --filename=*) output="\${argument#--filename=}" ;;
      esac
    done
    test -n "$output"
    printf '\\377\\330FAKE\\377\\331' > "$output"
    exit "\${FAKE_GPHOTO_CAPTURE_EXIT:-0}"
    ;;
esac`
  );
  await writeExecutable(
    lpstat,
    `case "\${1-}" in
  -p) printf '%s\\n' 'printer TEST_PHOTO is idle. enabled since today' ;;
  -d) printf '%s\\n' 'system default destination: TEST_PHOTO' ;;
  *) exit 2 ;;
esac`
  );
  await writeExecutable(
    lp,
    `printf '%s\\n' "$*" >> "$FAKE_LP_LOG"
printf '%s\\n' 'request id is TEST_PHOTO-1 (1 file(s))'`
  );

  const bridgeProcess = spawn(process.execPath, [bridge], {
    cwd: root,
    env: {
      ...process.env,
      PHOTOBOOTH_BRIDGE_PORT: String(port),
      PHOTOBOOTH_BRIDGE_TOKEN: TEST_TOKEN,
      PHOTOBOOTH_BRIDGE_ORIGINS: "http://localhost:3000",
      GPHOTO2_BIN: gphoto,
      SNAPYOS_DATA_DIR: join(directory, "data"),
      FAKE_GPHOTO_LOG: gphotoLog,
      FAKE_GPHOTO_CAPTURE_EXIT: "1",
      LPSTAT_BIN: lpstat,
      LP_BIN: lp,
      FAKE_LP_LOG: lpLog,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    await waitForHealth(baseUrl);

    const health = await fetch(`${baseUrl}/health`);
    assert.deepEqual(await health.json(), { ok: true, camera: true });

    // Preflight harus mengizinkan X-Bridge-Token, kalau tidak browser menolak
    // setiap panggilan perangkat sebelum request-nya terkirim.
    const preflight = await fetch(`${baseUrl}/camera/capture`, {
      method: "OPTIONS",
      headers: {
        origin: "http://localhost:3000",
        "access-control-request-method": "POST",
        "access-control-request-headers": "x-bridge-token,content-type",
      },
    });
    assert.equal(preflight.status, 204);
    assert.match(
      String(preflight.headers.get("access-control-allow-headers")).toLowerCase(),
      /x-bridge-token/
    );
    assert.equal(preflight.headers.get("access-control-allow-origin"), "http://localhost:3000");

    const status = await fetch(`${baseUrl}/v1/status`, { headers: auth });
    assert.equal(status.status, 200);
    const statusBody = await status.json();
    assert.equal(statusBody.ok, true);
    assert.equal(statusBody.camera.adapter, "gphoto2");
    assert.equal(statusBody.camera.connected, true);
    assert.equal(statusBody.camera.mock, false);
    assert.equal(statusBody.printer.adapter, "cups");
    assert.equal(statusBody.printer.ok, true);
    // Store lokal dibuka saat start; versi skema nyata, bukan 0.
    assert.ok(Number(statusBody.db_version) >= 1);
    assert.equal(statusBody.business_slug, null);

    const preview = await fetch(`${baseUrl}/camera/preview`, { headers: auth });
    assert.equal(preview.status, 200);
    assert.equal(preview.headers.get("content-type"), "image/jpeg");

    const firstCapture = await fetch(`${baseUrl}/camera/capture`, {
      method: "POST",
      headers: { origin: "http://localhost:3000", ...auth },
    });
    assert.equal(firstCapture.status, 200);
    assert.equal(firstCapture.headers.get("content-type"), "image/jpeg");
    assert.deepEqual(
      Array.from(new Uint8Array(await firstCapture.arrayBuffer())),
      [255, 216, 70, 65, 75, 69, 255, 217]
    );

    const secondCapture = await fetch(`${baseUrl}/camera/capture`, {
      method: "POST",
      headers: { origin: "http://localhost:3000", ...auth },
    });
    assert.equal(secondCapture.status, 200);
    const gphotoCalls = (await readFile(gphotoLog, "utf8"))
      .split("\n")
      .filter((line) => line.includes("capture-image-and-download"));
    assert.equal(gphotoCalls.length, 2);

    const print = await fetch(`${baseUrl}/print`, {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        "content-type": "application/json",
        ...auth,
      },
      body: JSON.stringify({
        paper_size: "4x6",
        orientation: "portrait",
        margins_mm: 3,
        sheets: [[pngBase64], [pngBase64]],
      }),
    });
    assert.equal(print.status, 200);
    const printBody = await print.json();
    // Sejak antrean lokal, `job_id` = ID job runtime (UUID), bukan teks spooler.
    assert.match(String(printBody.job_id), /^[0-9a-f-]{36}$/);
    assert.equal(printBody.status, "submitted");
    const lpArgs = await readFile(lpLog, "utf8");
    assert.match(lpArgs, /media=Custom\.101\.6x152\.4mm/);
    assert.match(lpArgs, /fit-to-page/);
    assert.match(lpArgs, /-n 1/);

    // Dedupe: payload sama tidak mengirim job kedua.
    const again = await fetch(`${baseUrl}/print`, {
      method: "POST",
      headers: { origin: "http://localhost:3000", "content-type": "application/json", ...auth },
      body: JSON.stringify({
        paper_size: "4x6",
        orientation: "portrait",
        margins_mm: 3,
        sheets: [[pngBase64], [pngBase64]],
      }),
    });
    const againBody = await again.json();
    assert.equal(againBody.job_id, printBody.job_id);
    assert.equal(againBody.deduplicated, true);

    const jobs = await (await fetch(`${baseUrl}/print/jobs?limit=5`, { headers: auth })).json();
    assert.equal(jobs.jobs.length, 1);
    assert.equal(jobs.jobs[0].status, "submitted");
    assert.equal(jobs.jobs[0].spool_job_id, "request id is TEST_PHOTO-1 (1 file(s))");

    const confirmed = await fetch(`${baseUrl}/print/jobs/${printBody.job_id}/confirm`, {
      method: "POST",
      headers: auth,
    });
    assert.equal((await confirmed.json()).job.status, "done");

    const printer = await fetch(`${baseUrl}/printer/health?printer=TEST_PHOTO`, { headers: auth });
    assert.equal(printer.status, 200);
    assert.equal((await printer.json()).ok, true);

    const forbidden = await fetch(`${baseUrl}/health`, {
      headers: { origin: "https://attacker.invalid" },
    });
    assert.equal(forbidden.status, 403);

    // Tanpa token (mis. curl / proses lokal lain) rute perangkat ditolak.
    const noToken = await fetch(`${baseUrl}/camera/capture`, { method: "POST" });
    assert.equal(noToken.status, 401);
    const wrongToken = await fetch(`${baseUrl}/print`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-bridge-token": "salah" },
      body: JSON.stringify({ sheets: [[pngBase64]] }),
    });
    assert.equal(wrongToken.status, 401);
    // /health tetap terbuka untuk Setup Perangkat sebelum token diisi.
    assert.equal((await fetch(`${baseUrl}/health`)).status, 200);
  } finally {
    await stop(bridgeProcess);
    await rm(directory, { recursive: true, force: true });
  }
});

test("bridge menolak start tanpa PHOTOBOOTH_BRIDGE_TOKEN", async () => {
  const port = await freePort();
  const bridgeProcess = spawn(process.execPath, [bridge], {
    cwd: root,
    env: {
      ...process.env,
      PHOTOBOOTH_BRIDGE_PORT: String(port),
      PHOTOBOOTH_BRIDGE_TOKEN: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const [code] = (await once(bridgeProcess, "exit")) as [number | null];
  assert.equal(code, 1);
});

test("bridge menolak adapter mock di produksi tanpa SNAPYOS_ALLOW_MOCK", async () => {
  const port = await freePort();
  const bridgeProcess = spawn(process.execPath, [bridge], {
    cwd: root,
    env: {
      ...process.env,
      PHOTOBOOTH_BRIDGE_PORT: String(port),
      PHOTOBOOTH_BRIDGE_TOKEN: TEST_TOKEN,
      NODE_ENV: "production",
      SNAPYOS_CAMERA: "mock",
      SNAPYOS_ALLOW_MOCK: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const [code] = (await once(bridgeProcess, "exit")) as [number | null];
  assert.equal(code, 1);
});

test("adapter mock melayani /v1/status dan capture tanpa hardware", async () => {
  const port = await freePort();
  const bridgeProcess = spawn(process.execPath, [bridge], {
    cwd: root,
    env: {
      ...process.env,
      PHOTOBOOTH_BRIDGE_PORT: String(port),
      PHOTOBOOTH_BRIDGE_TOKEN: TEST_TOKEN,
      SNAPYOS_CAMERA: "mock",
      SNAPYOS_PRINTER: "mock",
      SNAPYOS_ALLOW_MOCK: "1",
      SNAPYOS_DATA_DIR: join(tmpdir(), "snapyos-bridge-mock"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    await waitForHealth(baseUrl);

    const status = await (await fetch(`${baseUrl}/v1/status`, { headers: auth })).json();
    assert.equal(status.camera.mock, true);
    assert.equal(status.printer.mock, true);

    const capture = await fetch(`${baseUrl}/camera/capture`, { method: "POST", headers: auth });
    assert.equal(capture.status, 200);
    const body = Buffer.from(await capture.arrayBuffer());
    assert.equal(body[0], 0xff);
    assert.equal(body[1], 0xd8);
    assert.equal(body[body.length - 1], 0xd9);
  } finally {
    await stop(bridgeProcess);
  }
});
