/**
 * PRINT CUPS — antrean job runtime lokal (mock adapter, tanpa hardware).
 *
 * Membuktikan kontrak yang dipakai kiosk: `POST /print` idempoten per
 * `dedupe_key`, status berhenti di `submitted` sampai konfirmasi operator,
 * dan retry memakai job yang sama (bukan kirim ulang buta).
 *
 * Jalankan: `node tests/e2e/kiosk-print-cups.spec.mjs`
 */

import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createReporter } from "./helpers/report.mjs";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const report = createReporter("kiosk-print-cups");
const token = "e2e-bridge-token-0123456789";
const auth = { "x-bridge-token": token };
const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

async function freePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
  return port;
}

async function waitForHealth(baseUrl) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {
      // runtime belum bind
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Runtime tidak start dalam 10 detik.");
}

const dir = await mkdtemp(join(tmpdir(), "snapyos-print-cups-"));
const port = await freePort();
const child = spawn(process.execPath, [join(root, "scripts", "photobooth-bridge.mjs")], {
  cwd: root,
  env: {
    ...process.env,
    PHOTOBOOTH_BRIDGE_PORT: String(port),
    PHOTOBOOTH_BRIDGE_TOKEN: token,
    PHOTOBOOTH_BRIDGE_ORIGINS: "http://localhost:3000",
    SNAPYOS_CAMERA: "mock",
    SNAPYOS_PRINTER: "mock",
    SNAPYOS_ALLOW_MOCK: "1",
    SNAPYOS_DATA_DIR: join(dir, "data"),
  },
  stdio: ["ignore", "pipe", "pipe"],
});

try {
  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForHealth(baseUrl);

  const body = {
    session_id: "local_e2e",
    paper_size: "4x6",
    orientation: "auto",
    fit: "cover",
    canvas_aspect: 0.66,
    strips: false,
    sheets: [[png], [png]],
  };

  const first = await fetch(`${baseUrl}/print`, {
    method: "POST",
    headers: { "content-type": "application/json", ...auth },
    body: JSON.stringify(body),
  });
  const firstBody = await first.json();
  report.record(
    "submit masuk antrean dan berhenti di submitted",
    first.status === 200 && firstBody.status === "submitted" && Boolean(firstBody.job_id),
    JSON.stringify(firstBody)
  );

  const again = await fetch(`${baseUrl}/print`, {
    method: "POST",
    headers: { "content-type": "application/json", ...auth },
    body: JSON.stringify(body),
  });
  const againBody = await again.json();
  report.record(
    "dedupe session_id + sheet_hash",
    againBody.job_id === firstBody.job_id && againBody.deduplicated === true,
    JSON.stringify(againBody)
  );

  const list = await (await fetch(`${baseUrl}/print/jobs?limit=5`, { headers: auth })).json();
  report.record(
    "antrean hanya berisi satu job",
    Array.isArray(list.jobs) && list.jobs.length === 1 && list.jobs[0].status === "submitted",
    JSON.stringify(list.jobs?.map((job) => job.status))
  );

  const status = await (await fetch(`${baseUrl}/v1/status`, { headers: auth })).json();
  report.record(
    "status printer memuat mode + job",
    status.printer?.mode === "cups" && status.printer?.job?.status === "submitted",
    JSON.stringify(status.printer)
  );

  const retry = await fetch(`${baseUrl}/print/jobs/${firstBody.job_id}/retry`, {
    method: "POST",
    headers: auth,
  });
  const retryBody = await retry.json();
  report.record(
    "retry memakai job yang sama",
    retry.status === 200 && retryBody.job?.id === firstBody.job_id,
    JSON.stringify(retryBody.job?.status)
  );

  const confirmed = await fetch(`${baseUrl}/print/jobs/${firstBody.job_id}/confirm`, {
    method: "POST",
    headers: auth,
  });
  const confirmBody = await confirmed.json();
  report.record(
    "done hanya dari konfirmasi operator",
    confirmBody.job?.status === "done",
    JSON.stringify(confirmBody.job?.status)
  );
} catch (error) {
  report.record("pipeline antrean cetak runtime berjalan", false, error.message);
} finally {
  child.kill("SIGTERM");
  await once(child, "exit").catch(() => undefined);
  await rm(dir, { recursive: true, force: true });
  report.finish();
}
