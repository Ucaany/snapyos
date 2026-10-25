/**
 * Versi aplikasi booth, dibaca dari `package.json` sekali saat modul dimuat.
 *
 * Modul sendiri (bukan di `main.ts`) karena `main.ts` punya side effect
 * `await main()`; sync worker perlu nilai yang sama tanpa menjalankan server.
 */
import { readFileSync } from "node:fs";

export const VERSION: string = (() => {
  try {
    const raw = readFileSync(new URL("../package.json", import.meta.url), "utf8");
    return String((JSON.parse(raw) as { version?: string }).version ?? "0.0.0");
  } catch {
    return "0.0.0";
  }
})();
