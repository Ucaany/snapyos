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

/**
 * Produksi wajib Redis. Tanpa Redis, limiter TIDAK boleh diam-diam memakai
 * counter per-instance: limit efektif menjadi limit × jumlah instance.
 * `RATE_LIMIT_REQUIRE_REDIS=false` hanya untuk deployment single-instance yang
 * secara eksplisit menerima risiko itu.
 */
const REQUIRE_REDIS_IN_PRODUCTION = process.env.RATE_LIMIT_REQUIRE_REDIS !== "false";
const IS_PRODUCTION = process.env.NODE_ENV === "production";

let redisDegraded = false;
let redisRetryAfter = 0;
let lastDegradedLogAt = 0;

function logDegraded(reason: string) {
  const now = Date.now();
  if (now - lastDegradedLogAt < 60_000) return;
  lastDegradedLogAt = now;
  // Tidak pernah mencetak URL/token Redis.
  console.error(`[rate-limit] Redis tidak tersedia (${reason}); kebijakan produksi diterapkan`);
}

export type RateLimitOptions = {
  /**
   * Izinkan fallback in-memory saat Redis tidak tersedia. HANYA untuk endpoint
   * read-only/webhook yang tidak boleh mati total saat Redis outage. Default
   * fail-closed di production.
   */
  failOpen?: boolean;
};

export type RateLimitStatus = {
  backend: "redis" | "memory" | "unavailable";
  configured: boolean;
  degraded: boolean;
  productionRequiresRedis: boolean;
};

export function rateLimitStatus(): RateLimitStatus {
  const configured = redisAvailable;
  const backend = configured && !redisDegraded ? "redis" : configured ? "unavailable" : "memory";
  return {
    backend,
    configured,
    degraded: redisDegraded,
    productionRequiresRedis: IS_PRODUCTION && REQUIRE_REDIS_IN_PRODUCTION,
  };
}

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
  windowMs: number
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
    const oldest = (await redisCommand<string[]>(
      "ZRANGEBYSCORE",
      key,
      windowStart,
      "+inf",
      "LIMIT",
      0,
      1
    ).catch(() => [])) as string[];
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

// ---------------------------------------------------------------------------
// Public API — sama signature, consumer tidak perlu berubah
// ---------------------------------------------------------------------------

export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  options: RateLimitOptions = {}
): Promise<{ ok: boolean; retryAfterSec: number }> {
  if (redisAvailable && !redisDegraded) {
    try {
      return await redisSlidingWindow(`rl:${key}`, limit, windowMs);
    } catch {
      redisDegraded = true;
      redisRetryAfter = Date.now() + 30_000;
      logDegraded("request gagal");
    }
  }

  // coba reconnect Redis tiap 30 detik
  if (redisDegraded && Date.now() > redisRetryAfter) {
    redisDegraded = false;
  }

  // Produksi tanpa Redis: default fail-closed. Fallback lokal hanya bila
  // pemanggil eksplisit menandai endpoint aman (read-only/webhook).
  if (IS_PRODUCTION && REQUIRE_REDIS_IN_PRODUCTION && !options.failOpen) {
    logDegraded("backend tidak terkonfigurasi / outage");
    return { ok: false, retryAfterSec: 60 };
  }
  if (IS_PRODUCTION && options.failOpen) {
    logDegraded("fallback fail-open diizinkan pemanggil");
  }

  return inMemoryRateLimit(key, limit, windowMs);
}

/** Hitungan lokal (in-memory) — dipakai juga untuk merge saat Redis pulih. */
function localCount(key: string): number {
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= Date.now()) return 0;
  return bucket.count;
}

function localBump(key: string, windowMs: number): number {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return 1;
  }
  bucket.count += 1;
  return bucket.count;
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
      // Catat juga secara lokal: kegagalan yang terjadi saat Redis mati harus
      // tetap terhitung setelah backend pulih (Shared value bisa lebih rendah).
      return Math.max(results[0] as number, localBump(key, windowMs));
    } catch {
      redisDegraded = true;
      redisRetryAfter = Date.now() + 30_000;
    }
  }

  return localBump(key, windowMs);
}

/** Baca hitungan gagal TANPA menambahnya. */
export async function failureCount(key: string): Promise<number> {
  if (redisAvailable && !redisDegraded) {
    try {
      const val = await redisCommand<string | null>("GET", `fail:${key}`);
      const shared = val ? parseInt(val, 10) : 0;
      // max(), bukan shared saja: counter lokal memuat kegagalan yang dicatat
      // saat outage dan tidak boleh "turun" ketika shared value basi terbaca.
      return Math.max(Number.isFinite(shared) ? shared : 0, localCount(key));
    } catch {
      redisDegraded = true;
      redisRetryAfter = Date.now() + 30_000;
    }
  }

  return localCount(key);
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
  options: RateLimitOptions = {}
): Promise<{ ok: boolean; retryAfterSec: number } | null> {
  if (!deviceToken) return null;
  const prefix = deviceToken.slice(0, 16);
  const key = `${route}:device:${createHash("sha256").update(prefix).digest("hex").slice(0, 24)}`;
  return rateLimit(key, limit, windowMs, options);
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
