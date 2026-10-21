/**
 * Runner suite E2E — jalankan spec berurutan, hentikan pada kegagalan pertama,
 * lalu rangkum.
 *
 *   node tests/e2e/run.mjs             # semua suite yang tidak butuh server
 *   node tests/e2e/run.mjs kiosk       # suite yang butuh dev server + DB
 *
 * Prasyarat suite `kiosk`: dev server jalan dan `.env.local` berisi service
 * role. Suite `print-browser` dan `print-bluetooth` tidak butuh server.
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const group = process.argv[2] ?? "all";

const SUITES = {
  standalone: ["kiosk-print-browser.spec.mjs"],
  kiosk: [
    "kiosk-smoke.spec.mjs",
    "kiosk-lock.spec.mjs",
    "kiosk-frames.spec.mjs",
    "kiosk-full-frame-flow.spec.mjs",
    "kiosk-responsive.spec.mjs",
  ],
  bluetooth: ["kiosk-print-bluetooth.spec.mjs", "kiosk-print-serial.spec.mjs"],
};

const selected =
  group === "all"
    ? [...SUITES.standalone, ...SUITES.kiosk, ...SUITES.bluetooth]
    : (SUITES[group] ?? []);

if (selected.length === 0) {
  console.error(`Grup suite tidak dikenal: ${group}`);
  process.exit(1);
}

const failures = [];
for (const suite of selected) {
  console.log(`\n=== ${suite} ===`);
  const result = spawnSync(process.execPath, [join(here, suite)], {
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) failures.push(suite);
}

console.log(
  `\nE2E: ${selected.length - failures.length}/${selected.length} suite PASS` +
    (failures.length ? `\nGAGAL: ${failures.join(", ")}` : "")
);
process.exit(failures.length > 0 ? 1 : 0);
