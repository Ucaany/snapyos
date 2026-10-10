/**
 * Regresi P0 — produksi TANPA Upstash harus tetap jalan (fallback in-memory),
 * BUKAN fail-closed yang memblokir SEMUA login.
 *
 * Bug lama: `rateLimit("login:ip:…")` di produksi tanpa Upstash selalu
 * `{ ok: false }` → `authorize()` return null → login mati total.
 * Sesuai docs/09 § dan docs/08 §8.18: kosong = fallback in-memory.
 *
 * Dijalankan di child process dengan NODE_ENV=production (module membaca env
 * saat import) dan Upstash sengaja dikosongkan.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const PROBE = `
import { rateLimit, registerFailure } from "./src/lib/rate-limit.ts";
const r = await rateLimit("login:ip:203.0.113.9", 5, 60_000);
console.log(JSON.stringify({ ok: r.ok, failCount: await registerFailure("login:fail:a@b.c", 60_000) }));
`;

test("produksi tanpa Upstash: login key lolos (fallback in-memory, bukan fail-closed)", () => {
  const out = execFileSync(
    process.execPath,
    ["--experimental-strip-types", "--input-type=module", "-e", PROBE],
    {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        NODE_ENV: "production",
        UPSTASH_REDIS_REST_URL: "",
        UPSTASH_REDIS_REST_TOKEN: "",
      },
    }
  ).trim();
  const { ok, failCount } = JSON.parse(out) as { ok: boolean; failCount: number };
  assert.equal(ok, true, "login key harus lolos di produksi tanpa Upstash");
  assert.ok(failCount >= 1 && failCount < Number.MAX_SAFE_INTEGER, "registerFailure harus in-memory, bukan MAX_SAFE_INTEGER");
});
