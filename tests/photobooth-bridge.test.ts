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
esac`,
  );
  await writeExecutable(
    lpstat,
    `case "\${1-}" in
  -p) printf '%s\\n' 'printer TEST_PHOTO is idle. enabled since today' ;;
  -d) printf '%s\\n' 'system default destination: TEST_PHOTO' ;;
  *) exit 2 ;;
esac`,
  );
  await writeExecutable(
    lp,
    `printf '%s\\n' "$*" >> "$FAKE_LP_LOG"
printf '%s\\n' 'request id is TEST_PHOTO-1 (1 file(s))'`,
  );

  const bridgeProcess = spawn(process.execPath, [bridge], {
    cwd: root,
    env: {
      ...process.env,
      PHOTOBOOTH_BRIDGE_PORT: String(port),
      PHOTOBOOTH_BRIDGE_ORIGINS: "http://localhost:3000",
      GPHOTO2_BIN: gphoto,
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

    const preview = await fetch(`${baseUrl}/camera/preview`);
    assert.equal(preview.status, 200);
    assert.equal(preview.headers.get("content-type"), "image/jpeg");

    const firstCapture = await fetch(`${baseUrl}/camera/capture`, {
      method: "POST",
      headers: { origin: "http://localhost:3000" },
    });
    assert.equal(firstCapture.status, 200);
    assert.equal(firstCapture.headers.get("content-type"), "image/jpeg");
    assert.deepEqual(Array.from(new Uint8Array(await firstCapture.arrayBuffer())), [
      255,
      216,
      70,
      65,
      75,
      69,
      255,
      217,
    ]);

    const secondCapture = await fetch(`${baseUrl}/camera/capture`, {
      method: "POST",
      headers: { origin: "http://localhost:3000" },
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
      },
      body: JSON.stringify({
        paper_size: "4x6",
        orientation: "portrait",
        margins_mm: 3,
        sheets: [[pngBase64], [pngBase64]],
      }),
    });
    assert.equal(print.status, 200);
    assert.equal((await print.json()).job_id, "request id is TEST_PHOTO-1 (1 file(s))");
    const lpArgs = await readFile(lpLog, "utf8");
    assert.match(lpArgs, /media=Custom\.101\.6x152\.4mm/);
    assert.match(lpArgs, /fit-to-page/);
    assert.match(lpArgs, /-n 1/);

    const printer = await fetch(`${baseUrl}/printer/health?printer=TEST_PHOTO`);
    assert.equal(printer.status, 200);
    assert.equal((await printer.json()).ok, true);

    const forbidden = await fetch(`${baseUrl}/health`, {
      headers: { origin: "https://attacker.invalid" },
    });
    assert.equal(forbidden.status, 403);
  } finally {
    await stop(bridgeProcess);
    await rm(directory, { recursive: true, force: true });
  }
});
