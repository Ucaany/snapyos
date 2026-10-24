/**
 * Setiap route `/api/cron/*` harus terjadwal di KEDUA mekanisme deploy.
 *
 * Vercel memakai `vercel.json` (`crons`), VPS memakai `deploy/cron/snapyos.cron`.
 * Route yang tidak terjadwal tidak pernah jalan — persis bug `reconcile-storage`
 * (route ada, cron tidak) — dan `storage_usage` drift dibiarkan tumbuh.
 */

import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { test } from "node:test";

const root = new URL("../", import.meta.url);

let routes: string[];
let vercel: { crons?: { path: string }[] };
let crontab: string;

test("muat daftar route cron dan kedua konfigurasi jadwal", async () => {
  routes = (await readdir(new URL("src/app/api/cron/", root), { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  vercel = JSON.parse(await readFile(new URL("vercel.json", root), "utf8")) as typeof vercel;
  crontab = await readFile(new URL("deploy/cron/snapyos.cron", root), "utf8");
  assert.ok(routes.length > 0, "tidak ada route cron terdeteksi");
});

test("setiap route cron ada di vercel.json", () => {
  const scheduled = new Set((vercel.crons ?? []).map((c) => c.path.replace(/^\//, "")));
  const missing = routes.filter((r) => !scheduled.has(`api/cron/${r}`));
  assert.deepEqual(missing, [], `tidak terjadwal di vercel.json: ${missing.join(", ")}`);
});

test("setiap route cron ada di deploy/cron/snapyos.cron", () => {
  const missing = routes.filter((r) => !crontab.includes(`/api/cron/${r}`));
  assert.deepEqual(missing, [], `tidak terjadwal di snapyos.cron: ${missing.join(", ")}`);
});

test("kedua konfigurasi menjadwalkan set yang sama", () => {
  const inVercel = new Set(
    (vercel.crons ?? []).map((c) => c.path.replace(/^\/api\/cron\//, ""))
  );
  const inCron = new Set(
    [...crontab.matchAll(/\/api\/cron\/([a-z0-9-]+)/g)].map((m) => m[1] as string)
  );
  assert.deepEqual([...inVercel].sort(), [...inCron].sort());
});
