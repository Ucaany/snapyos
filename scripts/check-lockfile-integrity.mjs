#!/usr/bin/env node
/**
 * Gagal-closed kalau ada dependency di package-lock.json tanpa `integrity`.
 * Tanpa hash, `npm ci` memasang apa pun yang registry sajikan untuk
 * name@version itu — substitusi di layer registry langsung jadi RCE saat build
 * (berjalan sebagai root di VPS).
 */
import { readFileSync } from "node:fs";

const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
const packages = lock.packages ?? {};
const missing = Object.entries(packages)
  .filter(([key, value]) => key && !value.link && !value.integrity)
  .map(([key, value]) => `${key}@${value.version ?? "?"}`);

if (missing.length > 0) {
  console.error(
    `[check-lockfile-integrity] ${missing.length} entri tanpa integrity, contoh: ${missing
      .slice(0, 5)
      .join(", ")}`
  );
  console.error("Regenerate: rm -rf node_modules package-lock.json && npm install");
  process.exit(1);
}
console.log(`[check-lockfile-integrity] ok — ${Object.keys(packages).length} entri ber-hash`);
