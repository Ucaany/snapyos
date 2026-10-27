/**
 * Distributed rate limiter — sliding window via Upstash Redis REST API.
 *
 * Primary: Upstash Redis (UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN).
 * Fallback: in-memory fixed-window jika Redis tidak tersedia (graceful degradation).
 *
 * Sliding window: setiap request disimpan sebagai member ZSET dengan score = timestamp.
 * Window dihitung dari (now - windowMs) sampai now. Lebih akurat daripada fixed-window
 * karena tidak ada burst di boundary.
 */

import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// Upstash Redis REST client (minimal, zero-dependency)
// ---------------------------------------------------------------------------

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL ?? "";
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? "";
const redisAvailable = Boolean(UPSTASH_URL && UPSTASH_TOKEN);

let redisDegraded = false;
let redisRetryAfter = 0;

async function redisCommand<T = unknown>(...args: (string | number)[]): Promise<T> {
  const res = await fetch(`${UPSTASH_URL}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${UPSTASH_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`Upstash ${res.status}`);
  const json = (await res.json()) as { result: T; error?: string };
  if (json.error) throw new Error(json.error);
  return json.result;
}

async function redisPipeline(commands: (string | number)[][]): Promise<unknown[]> {
  const res = await fetch(`${UPSTASH_URL}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${UPSTASH_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error(`Upstash pipeline ${res.status}`);
  const json = (await res.json()) as { result: unknown; error?: string }[];
  for (const entry of json) {
    if (entry.error) throw new Error(entry.error);
  }
  return json.map((e) => e.result);
}

// ---------------------------------------------------------------------------
// Sliding window via Redis ZSET
// ---------------------------------------------------------------------------

async function redisSlidingWindow(
  key: string,
  limit: number,
  windowMs: number,
): Promise<{ ok: boolean; retryAfterSec: number }> {
  const now = Date.now();
  const windowStart = now - windowMs;
  const member = `${now}:${Math.random().toString(36).slice(2, 8)}`;
  const ttlSec = Math.ceil(windowMs / 1000);

  const results = await redisPipeline([
    ["ZREMRANGEBYSCORE", key, 0, windowStart],
    ["ZADD", key, now, member],
    ["ZCARD", key],
    ["EXPIRE", key, ttlSec],
  ]);

  const count = results[2] as number;
  if (count > limit) {
    // over limit — hapus member yang baru ditambahkan
    await redisCommand("ZREM", key, member).catch(() => {});
    const oldest = (await redisCommand<string[]>("ZRANGEBYSCORE", key, windowStart, "+inf", "LIMIT", 0, 1).catch(
      () => [],
    )) as string[];
    const firstEntry: string | undefined = oldest[0];
    const oldestTs = typeof firstEntry === "string" ? parseInt(firstEntry.split(":")[0]!, 10) : now;
    const retryAfterSec = Math.max(1, Math.ceil((oldestTs + windowMs - now) / 1000));
    return { ok: false, retryAfterSec };
  }

  return { ok: true, retryAfterSec: 0 };
}

// ---------------------------------------------------------------------------
// In-memory fallback (fixed-window, single process)
// ---------------------------------------------------------------------------

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

function sweep(now: number) {
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
  windowMs: number,
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

// ---------------------------------------------------------------------------
// Public API — sama signature, consumer tidak perlu berubah
// ---------------------------------------------------------------------------

export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<{ ok: boolean; retryAfterSec: number }> {
  if (redisAvailable && !redisDegraded) {
    try {
      return await redisSlidingWindow(`rl:${key}`, limit, windowMs);
    } catch {
      redisDegraded = true;
      redisRetryAfter = Date.now() + 30_000;
      // fallback ke in-memory
    }
  }

  // coba reconnect Redis tiap 30 detik
  if (redisDegraded && Date.now() > redisRetryAfter) {
    redisDegraded = false;
  }

  return inMemoryRateLimit(key, limit, windowMs);
}

/** Increment hitungan gagal (lockout per email — docs/09 §10). */
export async function registerFailure(key: string, windowMs: number): Promise<number> {
  if (redisAvailable && !redisDegraded) {
    try {
      const redisKey = `fail:${key}`;
      const ttlSec = Math.ceil(windowMs / 1000);
      const results = await redisPipeline([
        ["INCR", redisKey],
        ["EXPIRE", redisKey, ttlSec],
      ]);
      return results[0] as number;
    } catch {
      redisDegraded = true;
      redisRetryAfter = Date.now() + 30_000;
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

/** Baca hitungan gagal TANPA menambahnya. */
export async function failureCount(key: string): Promise<number> {
  if (redisAvailable && !redisDegraded) {
    try {
      const val = await redisCommand<string | null>("GET", `fail:${key}`);
      return val ? parseInt(val, 10) : 0;
    } catch {
      redisDegraded = true;
      redisRetryAfter = Date.now() + 30_000;
    }
  }

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= Date.now()) return 0;
  return bucket.count;
}

/**
 * Rate-limit per device (booth). Hanya hash prefix token sebagai key.
 * Return null bila token tidak ada.
 */
export async function rateLimitByDevice(
  route: string,
  deviceToken: string | null | undefined,
  limit: number,
  windowMs: number,
): Promise<{ ok: boolean; retryAfterSec: number } | null> {
  if (!deviceToken) return null;
  const prefix = deviceToken.slice(0, 16);
  const key = `${route}:device:${createHash("sha256").update(prefix).digest("hex").slice(0, 24)}`;
  return rateLimit(key, limit, windowMs);
}

/** Hapus bucket (reset hitungan setelah sukses). */
export async function resetLimit(key: string): Promise<void> {
  if (redisAvailable && !redisDegraded) {
    try {
      await redisPipeline([
        ["DEL", `rl:${key}`],
        ["DEL", `fail:${key}`],
      ]);
      return;
    } catch {
      redisDegraded = true;
      redisRetryAfter = Date.now() + 30_000;
    }
  }

  buckets.delete(key);
}
