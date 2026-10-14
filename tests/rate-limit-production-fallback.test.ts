/**
 * Regresi P0: produksi TANPA Upstash harus fail-closed.
 * Limiter in-memory hanya aman untuk proses tunggal di development/test;
 * deployment scale-out wajib memakai counter bersama.
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

test("produksi tanpa Upstash: limiter fail-closed", () => {
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
  assert.equal(ok, false, "login key harus ditolak bila shared store production tidak tersedia");
  assert.equal(
    failCount,
    Number.MAX_SAFE_INTEGER,
    "registerFailure harus mengunci login saat shared store production tidak tersedia"
  );
});
