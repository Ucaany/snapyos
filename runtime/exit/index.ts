/**
 * PIN darurat offline (`POST /v1/exit`).
 *
 * PIN utama tetap diverifikasi cloud. Jalur ini hanya jaring saat internet mati:
 * tanpa ini petugas terkurung di dalam booth. Karena itu PIN-nya terpisah
 * (`meta.exit_pin_emergency_hash`), tidak pernah ikut export, dan setiap
 * pemakaian dicatat sebagai `exit_pin_emergency_used` agar terlihat di dashboard.
 *
 * Rate-limit lokal meniru cloud: 5 gagal → kunci 5 menit, disimpan di `meta`
 * supaya bertahan setelah runtime restart.
 */

import type { DatabaseSync } from "node:sqlite";
import { verifyDevicePin } from "../../src/lib/device-token.ts";
import { getMeta, insertEvent, setMeta } from "../db/index.ts";
import { HttpError, type RouteResult } from "../http.ts";

export const EXIT_PIN_HASH_KEY = "exit_pin_emergency_hash";
export const EXIT_PIN_FAILED_KEY = "exit_pin_failed_count";
export const EXIT_PIN_LOCKED_KEY = "exit_pin_locked_until";

export const PIN_FAIL_THRESHOLD = 5;
export const PIN_LOCK_MS = 5 * 60 * 1000;

export type ExitContext = {
  db: DatabaseSync;
  now?: () => number;
};

function lockedUntilMs(db: DatabaseSync): number {
  const raw = getMeta(db, EXIT_PIN_LOCKED_KEY);
  if (!raw) return 0;
  const at = new Date(raw).getTime();
  return Number.isNaN(at) ? 0 : at;
}

function failedCount(db: DatabaseSync): number {
  return Number(getMeta(db, EXIT_PIN_FAILED_KEY) ?? 0) || 0;
}

/**
 * PIN darurat dipakai HANYA bila hash-nya terpasang. Tanpa hash, booth tidak
 * punya jalan keluar offline — lebih baik gagal jelas daripada diam-diam
 * mengizinkan siapa pun keluar.
 */
export async function verifyExitPin(
  ctx: ExitContext,
  pin: unknown
): Promise<{ status: number; body: unknown }> {
  const now = ctx.now?.() ?? Date.now();
  const hash = getMeta(ctx.db, EXIT_PIN_HASH_KEY);
  if (!hash) throw new HttpError("PIN darurat belum diatur di booth ini.", 409);

  const locked = lockedUntilMs(ctx.db);
  if (locked > now) {
    throw new HttpError(
      `PIN terkunci. Coba lagi dalam ${Math.ceil((locked - now) / 1000)} detik.`,
      429
    );
  }

  const candidate = typeof pin === "string" ? pin.trim() : "";
  const ok = candidate.length > 0 ? await verifyDevicePin(candidate, hash) : false;

  if (!ok) {
    const next = failedCount(ctx.db) + 1;
    if (next >= PIN_FAIL_THRESHOLD) {
      // Reset counter + set lock sekaligus: percobaan berikutnya harus menunggu
      // walau runtime restart di tengah jalan.
      setMeta(ctx.db, EXIT_PIN_FAILED_KEY, "0");
      setMeta(ctx.db, EXIT_PIN_LOCKED_KEY, new Date(now + PIN_LOCK_MS).toISOString());
      throw new HttpError(`PIN salah ${PIN_FAIL_THRESHOLD}x. Terkunci 5 menit.`, 429);
    }
    setMeta(ctx.db, EXIT_PIN_FAILED_KEY, String(next));
    throw new HttpError("PIN darurat salah.", 403);
  }

  setMeta(ctx.db, EXIT_PIN_FAILED_KEY, "0");
  if (locked) setMeta(ctx.db, EXIT_PIN_LOCKED_KEY, "");
  insertEvent(ctx.db, "exit_pin_emergency_used", null, { at: new Date(now).toISOString() });
  return { status: 200, body: { ok: true, emergency: true } };
}

/** Router `/v1/exit`. `null` = bukan rute ini. */
export function handleExitRoute(
  ctx: ExitContext,
  method: string,
  pathname: string,
  readBody: () => Promise<unknown>
): Promise<RouteResult> {
  if (method !== "POST" || pathname !== "/v1/exit") return Promise.resolve(null);
  return readBody().then((body) => {
    const pin =
      body && typeof body === "object" && !Array.isArray(body)
        ? (body as { pin?: unknown }).pin
        : undefined;
    return verifyExitPin(ctx, pin);
  });
}
