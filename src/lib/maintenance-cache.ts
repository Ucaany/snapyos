/**
 * Maintenance-mode short-cache — dipakai middleware untuk menghindari query DB
 * per request. TTL 30 detik agar toggle admin cepat terlihat oleh visitor.
 *
 * Cache module-level: bertahan di dalam satu Node.js instance (per lambda/proc).
 * Toleran terhadap DB error — fail-open (return false) agar site tidak blank
 * karena masalah infra.
 */

import "server-only";
import { createServerClient } from "@/lib/supabase/server";

const CACHE_TTL_MS = 30_000;

type CacheEntry = {
  value: boolean;
  fetchedAt: number;
};

let cache: CacheEntry | null = null;
let inflight: Promise<boolean> | null = null;

async function fetchMaintenanceFlag(): Promise<boolean> {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", "maintenance_mode")
      .maybeSingle();
    if (error) return false;
    const v = (data as { value?: unknown } | null)?.value;
    return v === true;
  } catch {
    return false;
  }
}

/** True bila platform sedang di-maintenance (dari platform_settings). Cached 30s. */
export async function isMaintenanceMode(): Promise<boolean> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) return cache.value;
  if (inflight) return inflight;
  inflight = fetchMaintenanceFlag()
    .then((value) => {
      cache = { value, fetchedAt: Date.now() };
      return value;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Invalidate cache — dipanggil admin action setelah toggle setting. */
export function invalidateMaintenanceCache(): void {
  cache = null;
}
