/**
 * Serialize suite yang memutasi print_settings satu booth.
 *
 * Beberapa spec E2E berjalan paralel dan memakai fixture booth yang sama;
 * tanpa lock, spec 58mm bisa membaca setelan 80mm milik spec lain.
 */

import { closeSync, mkdirSync, openSync, statSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";

const LOCK_PATH = ".audit/.print-settings.lock";
const STALE_MS = 5 * 60 * 1000;

/**
 * Ambil lock manual untuk suite yang harus menahan setelan selama browser
 * membaca config (bukan hanya selama satu UPDATE). Pemanggil WAJIB melepas
 * lewat fungsi yang dikembalikan, termasuk di jalur error.
 */
export async function acquirePrintLock(timeoutMs = 120_000) {
  mkdirSync(dirname(LOCK_PATH), { recursive: true });
  const deadline = Date.now() + timeoutMs;
  let fd = null;
  while (fd === null) {
    try {
      fd = openSync(LOCK_PATH, "wx");
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      try {
        if (Date.now() - statSync(LOCK_PATH).mtimeMs > STALE_MS) {
          unlinkSync(LOCK_PATH);
          continue;
        }
      } catch {
        continue;
      }
      if (Date.now() > deadline) throw new Error("Timeout menunggu lock print_settings");
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  closeSync(fd);
  let released = false;
  return async () => {
    if (released) return;
    released = true;
    try {
      unlinkSync(LOCK_PATH);
    } catch {
      /* lock mungkin sudah dibersihkan proses lain setelah stale */
    }
  };
}

export async function withPrintLock(fn, timeoutMs = 120_000) {
  const release = await acquirePrintLock(timeoutMs);
  try {
    return await fn();
  } finally {
    await release();
  }
}
