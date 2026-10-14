/**
 * Rate limiter fixed-window dengan backend opsional shared (Upstash Redis REST).
 * Kebijakan: docs/08 §8.18 + docs/09 §10 (login 5/menit/IP, lockout per email).
 *
 * - Bila `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` di-set → pakai
 *   Upstash (counter shared lintas instance; aman untuk scale-out).
 * - Bila tidak → fallback in-memory hanya untuk dev/test; production fail-closed.
 * - Non-production: bila Upstash error → fail-open (jangan blokir dev).
 *   Production: bila Upstash error → fail-closed (tolak; jangan bocorkan limit).
 */

import { createHash } from "node:crypto";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL?.trim();
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
const hasUpstash = Boolean(UPSTASH_URL && UPSTASH_TOKEN);

const productionWithoutSharedStore =
  process.env.NODE_ENV === "production" && !hasUpstash;

function sweep(now: number) {
  // TTL berbasis waktu: sapu tiap 60 detik ATAU saat size besar, bukan hanya size.
  const lastSweepAt = (sweep as unknown as { last?: number }).last ?? 0;
  if (buckets.size < 10_000 && now - lastSweepAt < 60_000) return;
  (sweep as unknown as { last?: number }).last = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

function inMemoryRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  sweep(now);
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    return { ok: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  return { ok: true, retryAfterSec: 0 };
}

/**
 * Bump counter fixed-window via Upstash secara ATOMIK (satu pipeline):
 *   INCR key            → nilai count baru (dipakai apa adanya)
 *   EXPIRE key ttl NX   → set TTL HANYA bila belum ada (fixed window utuh)
 * Return {count, ttlSec}. Tidak ada GET-then-SET (race-free).
 */
async function upstashIncr(key: string, windowMs: number): Promise<{ count: number; ttlSec: number }> {
  const ttlSec = Math.max(1, Math.ceil(windowMs / 1000));
  const res = await fetch(`${UPSTASH_URL}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${UPSTASH_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      ["INCR", key],
      ["EXPIRE", key, ttlSec, "NX"],
    ]),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Upstash pipeline ${res.status}`);
  const results = (await res.json()) as { error?: string; result?: number }[];
  const incr = results[0];
  if (!incr || incr.error || typeof incr.result !== "number") {
    throw new Error(`Upstash INCR gagal: ${incr?.error ?? "hasil tidak valid"}`);
  }
  return { count: incr.result, ttlSec };
}

/**
 * Rate limit fixed-window. Async agar backend shared (Upstash) bisa dipakai.
 * Interface (key, limit, windowMs) dipertahankan dari versi in-memory.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<{ ok: boolean; retryAfterSec: number }> {
  if (!hasUpstash) {
    if (productionWithoutSharedStore) {
      return { ok: false, retryAfterSec: Math.max(1, Math.ceil(windowMs / 1000)) };
    }
    return inMemoryRateLimit(key, limit, windowMs);
  }
  try {
    const { count, ttlSec } = await upstashIncr(key, windowMs);
    if (count > limit) return { ok: false, retryAfterSec: ttlSec };
    return { ok: true, retryAfterSec: 0 };
  } catch {
    // Upstash error: dev/test fail-open (jangan blokir), production fail-closed.
    if (process.env.NODE_ENV === "production") {
      return { ok: false, retryAfterSec: Math.max(1, Math.ceil(windowMs / 1000)) };
    }
    return inMemoryRateLimit(key, limit, windowMs);
  }
}

/** Increment hitungan gagal (lockout per email — docs/09 §10). */
export async function registerFailure(key: string, windowMs: number): Promise<number> {
  if (productionWithoutSharedStore) return Number.MAX_SAFE_INTEGER;
  if (hasUpstash) {
    try {
      const { count } = await upstashIncr(key, windowMs);
      return count;
    } catch {
      // Production: fail-closed — kembalikan nilai di atas ambang lockout
      // (pemanggil menolak login). Jangan pecah counter ke per-instance memory.
      if (process.env.NODE_ENV === "production") return Number.MAX_SAFE_INTEGER;
      // Non-production: lanjut ke in-memory di bawah (jangan blokir dev).
    }
  }
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return 1;
  }
  bucket.count += 1;
  return bucket.count;
}

/**
 * Rate-limit tambahan berskala device (per booth), BUKAN pengganti limit IP.
 * Banyak booth di belakang satu NAT berbagi bucket IP — pembatas ini memakai
 * prefix hash device_token sehingga traffic satu booth tidak menstarvasi booth
 * lain, sementara limit IP existing tetap berlaku sebagai lapis kedua.
 *
 * Hanya `prefix` token yang di-hash (bukan token penuh) agar key limiter tidak
 * menyimpan bearer credential; token tidak reversibel dari hash ini.
 * Return null bila token tidak ada (route tetap jalan dengan limit IP saja).
 */
export async function rateLimitByDevice(
  route: string,
  deviceToken: string | null | undefined,
  limit: number,
  windowMs: number
): Promise<{ ok: boolean; retryAfterSec: number } | null> {
  if (!deviceToken) return null;
  const prefix = deviceToken.slice(0, 16);
  const key = `${route}:device:${createHash("sha256").update(prefix).digest("hex").slice(0, 24)}`;
  return rateLimit(key, limit, windowMs);
}

/** Hapus bucket (reset hitungan setelah sukses). */
export async function resetLimit(key: string): Promise<void> {
  buckets.delete(key);
  if (hasUpstash) {
    try {
      await fetch(`${UPSTASH_URL}/del/${encodeURIComponent(key)}`, {
        headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
        cache: "no-store",
      });
    } catch {
      /* best-effort: bucket in-memory tetap dihapus */
    }
  }
}
