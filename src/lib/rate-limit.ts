/** In-memory sliding-window rate limiter for single-instance deployments. */

import { createHash } from "node:crypto";

export type RateLimitStatus = {
  backend: "memory";
  configured: boolean;
  degraded: boolean;
  productionRequiresRedis: boolean;
};

export function rateLimitStatus(): RateLimitStatus {
  return {
    backend: "memory",
    configured: false,
    degraded: false,
    productionRequiresRedis: false,
  };
}

// ---------------------------------------------------------------------------
// In-memory fallback (fixed-window, single process)
// ---------------------------------------------------------------------------

type Bucket = { timestamps: number[] };
const buckets = new Map<string, Bucket>();

function sweep(now: number) {
  const lastSweepAt = (sweep as unknown as { last?: number }).last ?? 0;
  if (buckets.size < 10_000 && now - lastSweepAt < 60_000) return;
  (sweep as unknown as { last?: number }).last = now;
  for (const [key, bucket] of buckets) {
    bucket.timestamps = bucket.timestamps.filter((timestamp) => timestamp > now - 3_600_000);
    if (bucket.timestamps.length === 0) buckets.delete(key);
  }
}

function inMemoryRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  sweep(now);
  const windowStart = now - windowMs;
  const bucket = buckets.get(key) ?? { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((timestamp) => timestamp > windowStart);
  if (bucket.timestamps.length >= limit) {
    const oldest = bucket.timestamps[0] ?? now;
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)) };
  }
  bucket.timestamps.push(now);
  buckets.set(key, bucket);
  return { ok: true, retryAfterSec: 0 };
}

// ---------------------------------------------------------------------------
// Public API — sama signature, consumer tidak perlu berubah
// ---------------------------------------------------------------------------

export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<{ ok: boolean; retryAfterSec: number }> {
  return inMemoryRateLimit(key, limit, windowMs);
}

/** Read current local failure count without incrementing it. */
function localCount(key: string): number {
  const bucket = buckets.get(key);
  if (!bucket) return 0;
  const now = Date.now();
  const timestamps = bucket.timestamps.filter((timestamp) => timestamp > now - 15 * 60_000);
  bucket.timestamps = timestamps;
  return timestamps.length;
}

function localBump(key: string, windowMs: number): number {
  const now = Date.now();
  const bucket = buckets.get(key);
  const windowStart = now - windowMs;
  const timestamps = (bucket?.timestamps ?? []).filter((timestamp) => timestamp > windowStart);
  timestamps.push(now);
  buckets.set(key, { timestamps });
  return timestamps.length;
}

/** Increment hitungan gagal (lockout per email — docs/09 §10). */
export async function registerFailure(key: string, windowMs: number): Promise<number> {
  return localBump(key, windowMs);
}

/** Baca hitungan gagal TANPA menambahnya. */
export async function failureCount(key: string): Promise<number> {
  return localCount(key);
}

/**
 * Rate-limit per device (booth) menggunakan full token hash sebagai key.
 * Return null bila token tidak ada.
 */
export async function rateLimitByDevice(
  route: string,
  deviceToken: string | null | undefined,
  limit: number,
  windowMs: number
): Promise<{ ok: boolean; retryAfterSec: number } | null> {
  if (!deviceToken) return null;
  const key = `${route}:device:${createHash("sha256").update(deviceToken).digest("hex").slice(0, 24)}`;
  return rateLimit(key, limit, windowMs);
}

/** Hapus bucket (reset hitungan setelah sukses). */
export async function resetLimit(key: string): Promise<void> {
  buckets.delete(key);
}
