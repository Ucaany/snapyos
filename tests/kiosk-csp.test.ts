import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { test } from "node:test";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = readFileSync(join(root, "next.config.ts"), "utf8");

/**
 * CSP dievaluasi sebagai teks karena `next.config.ts` dijalankan Next, bukan
 * test runner. Yang dijaga di sini adalah kebenaran yang tidak bisa dilihat
 * `fetch` Node: apakah browser diizinkan memanggil loopback.
 */
test("CSP connect-src mengizinkan runtime lokal di loopback", () => {
  const connect = /"connect-src ([^"]+)"/.exec(source);
  assert.ok(connect, "connect-src tidak ditemukan di next.config.ts");
  const value = connect[1] as string;

  assert.match(value, /'self'/);
  assert.match(value, /https:/);
  assert.match(value, /http:\/\/127\.0\.0\.1:\*/);
  assert.match(value, /http:\/\/localhost:\*/);
});

test("CSP tidak membuka skema http untuk seluruh internet", () => {
  const connect = /"connect-src ([^"]+)"/.exec(source);
  assert.ok(connect);
  const tokens = (connect[1] as string).split(/\s+/);
  // `http:` polos akan mengizinkan origin http mana pun — bukan yang dimaksud.
  assert.ok(!tokens.includes("http:"), "connect-src memuat http: tanpa host");
});
