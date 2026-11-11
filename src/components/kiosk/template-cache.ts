"use client";

/**
 * Cache template kiosk sisi browser — snapshot daftar (localStorage) + biner
 * thumbnail/frame (Cache Storage). SW hanya MEMBACA cache ini; penulisnya
 * klien supaya timing aktivasi SW tidak menentukan dan byte tercatat.
 *
 * Logika key/plan ada di modul murni `@/lib/template-cache` (bisa diuji node).
 */

import type { PublicTemplate } from "@/lib/kiosk-types";
import {
  TEMPLATE_CACHE_NAME,
  TEMPLATE_INDEX_PREFIX,
  TEMPLATE_SNAPSHOT_PREFIX,
  frameCacheUrl,
  parseAssetKey,
  parseIndex,
  parseSnapshot,
  pickEvictions,
  planWarm,
  summarizeIndex,
  type AssetIndex,
  type Snapshot,
} from "@/lib/template-cache";

/** Snapshot dianggap segar 5 menit — samakan dengan revalidasi TemplatePicker. */
export const SNAPSHOT_FRESH_MS = 5 * 60 * 1000;
/** Budget warm total (thumbnail + frame): 250 MB atau 25% kuota, mana yang kecil. */
const MAX_BUDGET_BYTES = 250 * 1024 * 1024;
const THUMB_CONCURRENCY = 2;
const THUMB_GAP_MS = 150;
const INDEX_FLUSH_EVERY = 5;
const RATE_LIMIT_BACKOFF_MS = [2_000, 5_000, 10_000];

export type WarmResult = {
  ok: boolean;
  reason?: "network" | "unavailable";
  thumbs: number;
  frames: number;
  bytes: number;
  skippedFrames: number;
  aborted?: boolean;
};

const snapshotKey = (slug: string) => `${TEMPLATE_SNAPSHOT_PREFIX}${slug}`;
const indexKey = (slug: string) => `${TEMPLATE_INDEX_PREFIX}${slug}`;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const emptyResult = (): WarmResult => ({
  ok: true,
  thumbs: 0,
  frames: 0,
  bytes: 0,
  skippedFrames: 0,
});

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* kuota/privasi: cache dilewati, jaringan tetap jalan */
  }
}

function safeRemove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function writeIndex(slug: string, index: AssetIndex): void {
  safeSet(indexKey(slug), JSON.stringify(index));
}

function readIndex(slug: string): AssetIndex {
  return parseIndex(safeGet(indexKey(slug)));
}

/** Snapshot sinkron — `null` di server / saat localStorage tidak tersedia. */
export function readTemplateSnapshot(slug: string): Snapshot | null {
  if (typeof window === "undefined") return null;
  return parseSnapshot(safeGet(snapshotKey(slug)));
}

/** Simpan snapshot daftar LENGKAP (bukan hasil filter paket). Best-effort. */
export function writeTemplateSnapshot(slug: string, templates: PublicTemplate[]): void {
  if (typeof window === "undefined") return;
  safeSet(snapshotKey(slug), JSON.stringify({ schema: 1, fetchedAt: Date.now(), templates }));
}

function normalizeTemplates(data: unknown): PublicTemplate[] {
  if (!Array.isArray(data)) return [];
  const out: PublicTemplate[] = [];
  for (const raw of data) {
    if (typeof raw !== "object" || raw === null) continue;
    const t = raw as Partial<PublicTemplate>;
    if (typeof t.id !== "string" || typeof t.file_url !== "string") continue;
    out.push({
      id: t.id,
      name: typeof t.name === "string" ? t.name : "",
      category: typeof t.category === "string" ? t.category : "custom",
      file_url: t.file_url,
      thumbnail_url: typeof t.thumbnail_url === "string" ? t.thumbnail_url : null,
      layout: t.layout ?? null,
      slot_count: typeof t.slot_count === "number" ? t.slot_count : 0,
      version: typeof t.version === "number" && Number.isFinite(t.version) ? t.version : 0,
      package_ids: Array.isArray(t.package_ids)
        ? t.package_ids.filter((id): id is string => typeof id === "string")
        : [],
    });
  }
  return out;
}

async function dropKey(
  cache: Cache,
  index: AssetIndex,
  origin: string,
  key: string
): Promise<void> {
  try {
    await cache.delete(frameCacheUrl(origin, key));
  } catch {
    /* ignore */
  }
  index.entries = index.entries.filter((entry) => entry.key !== key);
}

async function runPool<T>(
  items: readonly T[],
  limit: number,
  gapMs: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const at = cursor++;
      const item = items[at];
      if (at >= items.length || item === undefined) return;
      if (gapMs > 0) await sleep(gapMs);
      await worker(item);
    }
  });
  await Promise.all(runners);
}

function isQuotaError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "QuotaExceededError"
    : (error as { name?: string } | null)?.name === "QuotaExceededError";
}

/**
 * Unduh seluruh thumbnail (dan frame penuh bila budget/kuota mengizinkan) ke
 * Cache Storage. Kegagalan jaringan mengembalikan `{ ok: false, reason:
 * "network" }` dan TIDAK menghapus cache lama.
 */
export async function warmTemplateCache(
  slug: string,
  { signal }: { signal?: AbortSignal } = {}
): Promise<WarmResult> {
  if (typeof window === "undefined") return { ...emptyResult(), ok: false, reason: "unavailable" };
  const aborted = (): WarmResult => ({ ...emptyResult(), aborted: true });

  const rawSnapshot = safeGet(snapshotKey(slug));
  let snapshot = parseSnapshot(rawSnapshot);
  let index = readIndex(slug);

  // Snapshot rusak / schema asing: bersihkan cache aset sekali, lalu unduh ulang.
  if (rawSnapshot && !snapshot) {
    try {
      await caches.delete(TEMPLATE_CACHE_NAME);
    } catch {
      /* ignore */
    }
    index = { schema: 1, entries: [] };
    safeRemove(snapshotKey(slug));
    writeIndex(slug, index);
  }

  let fresh: PublicTemplate[];
  if (snapshot && Date.now() - snapshot.fetchedAt < SNAPSHOT_FRESH_MS) {
    fresh = snapshot.templates;
  } else {
    let payload: unknown;
    try {
      const res = await fetch(`/api/v1/public/${slug}/templates`, {
        credentials: "same-origin",
        signal,
      });
      if (!res.ok) return { ...emptyResult(), ok: false, reason: "network" };
      payload = (await res.json())?.data;
    } catch {
      if (signal?.aborted) return aborted();
      return { ...emptyResult(), ok: false, reason: "network" };
    }
    if (!Array.isArray(payload)) return { ...emptyResult(), ok: false, reason: "network" };
    fresh = normalizeTemplates(payload);
    writeTemplateSnapshot(slug, fresh);
    snapshot = { schema: 1, fetchedAt: Date.now(), templates: fresh };
  }

  if (signal?.aborted) return aborted();
  if (typeof caches === "undefined") return { ...emptyResult(), ok: false, reason: "unavailable" };

  const origin = window.location.origin;
  let cache: Cache;
  try {
    cache = await caches.open(TEMPLATE_CACHE_NAME);
  } catch {
    return { ...emptyResult(), ok: false, reason: "unavailable" };
  }

  let budget = MAX_BUDGET_BYTES;
  try {
    const estimate = await navigator.storage?.estimate?.();
    if (estimate?.quota && Number.isFinite(estimate.quota)) {
      budget = Math.min(MAX_BUDGET_BYTES, estimate.quota * 0.25);
    }
  } catch {
    /* estimate tidak tersedia: pakai 250 MB */
  }

  const plan = planWarm(fresh, index);
  const result = emptyResult();

  // Template yang hilang: aman dihapus sekarang (tidak ada pengganti).
  for (const key of plan.prune) await dropKey(cache, index, origin, key);
  writeIndex(slug, index);

  async function saveAsset(key: string, url: string): Promise<number | null> {
    const response = await fetch(url, { credentials: "same-origin", signal, cache: "no-store" });
    if (!response.ok) return null;
    // Clone SEBELUM body dibaca: clone setelah body terpakai akan melempar.
    const copy = response.clone();
    const blob = await response.blob();
    const size = blob.size > 0 ? blob.size : Number(copy.headers.get("content-length") ?? 0) || 0;
    await cache.put(new Request(frameCacheUrl(origin, key)), copy);
    index.entries.push({ key, bytes: size, lastUsed: Date.now() });
    return size;
  }

  async function clearStale(templateId: string, kind: "thumb" | "full"): Promise<void> {
    for (const key of plan.stale[templateId] ?? []) {
      if (parseAssetKey(key)?.kind === kind) await dropKey(cache, index, origin, key);
    }
  }

  // 1) Thumbnail — konkurensi 2, jeda 150 ms agar booth tidak dibanjiri.
  await runPool(plan.thumbs, THUMB_CONCURRENCY, THUMB_GAP_MS, async (item) => {
    if (signal?.aborted) return;
    try {
      const size = await saveAsset(item.key, item.url);
      if (size === null) return;
      result.thumbs += 1;
      result.bytes += size;
      const parsed = parseAssetKey(item.key);
      if (parsed) await clearStale(parsed.templateId, "thumb");
    } catch {
      /* satu thumb gagal tidak menghentikan sisanya */
    }
  });
  writeIndex(slug, index);

  // 2) Frame penuh — saveData cukup thumbnail; sisanya unduh berurutan.
  const saveData =
    (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData ===
    true;
  if (!saveData) {
    let budgetSkips = 0;
    let rateLimited = 0;

    for (let i = 0; i < plan.frames.length; i += 1) {
      if (signal?.aborted) break;
      const item = plan.frames[i];
      if (!item) break;
      let response: Response | null = null;

      for (;;) {
        try {
          response = await fetch(item.url, {
            credentials: "same-origin",
            signal,
            cache: "no-store",
          });
        } catch {
          response = null;
          break;
        }
        if (response.status !== 429) break;
        if (rateLimited >= RATE_LIMIT_BACKOFF_MS.length) break;
        const wait = RATE_LIMIT_BACKOFF_MS[rateLimited] ?? 10_000;
        rateLimited += 1;
        await sleep(wait);
        if (signal?.aborted) break;
      }

      if (signal?.aborted) break;
      if (!response || !response.ok) {
        result.skippedFrames += 1;
        if (rateLimited >= RATE_LIMIT_BACKOFF_MS.length) break;
        continue;
      }

      const copy = response.clone();
      const blob = await response.blob().catch(() => null);
      if (!blob) {
        result.skippedFrames += 1;
        continue;
      }
      const size = blob.size > 0 ? blob.size : Number(copy.headers.get("content-length") ?? 0) || 0;
      const total = summarizeIndex(index).totalBytes;

      if (size > 0 && total + size > budget) {
        const evict = pickEvictions(index, total + size - budget, ["thumb"]);
        for (const key of evict) await dropKey(cache, index, origin, key);
        if (summarizeIndex(index).totalBytes + size > budget) {
          result.skippedFrames += 1;
          budgetSkips += 1;
          if (budgetSkips >= 3) break;
          continue;
        }
      }

      let stored = false;
      for (let attempt = 0; attempt < 2 && !stored; attempt += 1) {
        try {
          await cache.put(new Request(frameCacheUrl(origin, item.key)), copy.clone());
          stored = true;
        } catch (error) {
          if (!isQuotaError(error)) break;
          const need = summarizeIndex(index).totalBytes + size - budget;
          const evict = pickEvictions(index, Math.max(need, size), ["thumb"]);
          if (evict.length === 0) break;
          for (const key of evict) await dropKey(cache, index, origin, key);
        }
      }

      if (!stored) {
        result.skippedFrames += 1;
        continue;
      }

      index.entries.push({ key: item.key, bytes: size, lastUsed: Date.now() });
      result.frames += 1;
      result.bytes += size;
      budgetSkips = 0;
      rateLimited = 0;
      const parsed = parseAssetKey(item.key);
      if (parsed) await clearStale(parsed.templateId, "full");
      if (result.frames % INDEX_FLUSH_EVERY === 0) writeIndex(slug, index);
    }
  }

  writeIndex(slug, index);
  if (signal?.aborted) return { ...result, aborted: true };
  return result;
}

/**
 * Buang snapshot/index/aset bisnis lain — tablet yang dipindah booth tidak
 * boleh menyisakan frame bisnis lama di cache.
 */
export async function purgeOtherBusinesses(activeSlug: string): Promise<void> {
  if (typeof window === "undefined") return;
  let slugs: string[] = [];
  try {
    slugs = Array.from({ length: window.localStorage.length }, (_, i) =>
      window.localStorage.key(i)
    ).filter((key): key is string => typeof key === "string");
  } catch {
    return;
  }

  for (const key of slugs) {
    const prefix = key.startsWith(TEMPLATE_SNAPSHOT_PREFIX)
      ? TEMPLATE_SNAPSHOT_PREFIX
      : key.startsWith(TEMPLATE_INDEX_PREFIX)
        ? TEMPLATE_INDEX_PREFIX
        : null;
    if (!prefix) continue;
    const slug = key.slice(prefix.length);
    if (slug === activeSlug) continue;

    try {
      if (prefix === TEMPLATE_INDEX_PREFIX) {
        const index = parseIndex(safeGet(key));
        if (typeof caches !== "undefined") {
          const cache = await caches.open(TEMPLATE_CACHE_NAME).catch(() => null);
          if (cache) {
            const origin = window.location.origin;
            for (const entry of index.entries) {
              await cache.delete(frameCacheUrl(origin, entry.key)).catch(() => undefined);
            }
          }
        }
      }
    } catch {
      /* ignore */
    }
    safeRemove(key);
  }
}
