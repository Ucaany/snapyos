import "server-only";

import { readFile, statfs } from "node:fs/promises";
import os from "node:os";

import { createServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "./guard";

/**
 * Kesehatan infrastruktur admin: Supabase, VPS, dan Cloudflare.
 * Angka VPS dibaca dari node:os / /proc, jadi mengukur mesin yang melayani
 * request ini. Metrik jaringan hanya ada di Linux; platform lain dapat null.
 */

export type SupabaseHealth = {
  reachable: boolean;
  dbSizeBytes: number | null;
  activeConnections: number | null;
  maxConnections: number | null;
  cacheHitRatio: number | null;
  apiLatencyMs: number | null;
  storageUsedBytes: number;
  storageObjectCount: number | null;
};

export type VpsHealth = {
  platform: string;
  release: string;
  arch: string;
  cpuCount: number;
  load1: number;
  load5: number;
  load15: number;
  loadPct: number;
  memTotal: number;
  memFree: number;
  memUsed: number;
  memPct: number;
  processRss: number;
  diskTotal: number | null;
  diskFree: number | null;
  diskUsed: number | null;
  diskPct: number | null;
  uptimeSec: number;
  processUptimeSec: number;
  netRxBytes: number | null;
  netTxBytes: number | null;
  netRxMbps: number | null;
  netTxMbps: number | null;
};

export type CloudflareCountry = { code: string; requests: number; threats: number };

export type CloudflareHealth = {
  configured: boolean;
  ok: boolean;
  requests: number | null;
  cachedRequests: number | null;
  cacheRatio: number | null;
  bytes: number | null;
  pageViews: number | null;
  uniques: number | null;
  threats: number | null;
  clientErrors: number | null;
  serverErrors: number | null;
  countries: CloudflareCountry[];
  error: string | null;
  /** Env yang belum diisi, supaya UI bisa menyebut nama variabelnya. */
  missing: string[];
};

export type InfraHealth = {
  supabase: SupabaseHealth;
  vps: VpsHealth;
  cloudflare: CloudflareHealth;
};

export async function getInfraHealth(): Promise<InfraHealth> {
  await requireAdmin();
  const [supabase, vps, cloudflare] = await Promise.all([
    readSupabaseHealth(),
    readVpsHealth(),
    readCloudflareHealth(),
  ]);
  return { supabase, vps, cloudflare };
}

async function readSupabaseHealth(): Promise<SupabaseHealth> {
  const supabase = createServerClient();

  const empty: SupabaseHealth = {
    reachable: false,
    dbSizeBytes: null,
    activeConnections: null,
    maxConnections: null,
    cacheHitRatio: null,
    apiLatencyMs: null,
    storageUsedBytes: 0,
    storageObjectCount: null,
  };

  const startedAt = performance.now();
  const [rpc, storage, latencyProbe] = await Promise.all([
    supabase.rpc("admin_db_health"),
    supabase.from("storage_usage").select("used_bytes"),
    supabase.from("users").select("id", { count: "exact", head: true }),
  ]);
  const latencyMs = Math.round(performance.now() - startedAt);

  const storageRows = (storage.data ?? []) as { used_bytes: number }[];

  // RPC opsional: hanya ada setelah migrasi 0092 dijalankan.
  const db = (rpc.error ? null : rpc.data) as
    | {
        database_size_bytes?: number;
        active_connections?: number;
        max_connections?: number;
        cache_hit_ratio?: number;
      }
    | null;

  return {
    ...empty,
    reachable: !latencyProbe.error,
    apiLatencyMs: latencyProbe.error ? null : latencyMs,
    storageUsedBytes: storageRows.reduce((total, row) => total + (row.used_bytes ?? 0), 0),
    storageObjectCount: storage.error ? null : storageRows.length,
    dbSizeBytes: db?.database_size_bytes ?? null,
    activeConnections: db?.active_connections ?? null,
    maxConnections: db?.max_connections ?? null,
    cacheHitRatio: typeof db?.cache_hit_ratio === "number" ? db.cache_hit_ratio : null,
  };
}

async function readVpsHealth(): Promise<VpsHealth> {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = Math.max(0, totalMem - freeMem);
  const load = os.loadavg();
  const load1 = load[0] ?? 0;
  const load5 = load[1] ?? 0;
  const load15 = load[2] ?? 0;

  const disk = await readDisk();
  const net = await readNetwork(os.uptime());

  return {
    platform: os.platform(),
    release: os.release(),
    arch: os.arch(),
    cpuCount: os.cpus().length,
    load1,
    load5,
    load15,
    loadPct: Math.min(100, Math.round((load1 / Math.max(1, os.cpus().length)) * 100)),
    memTotal: totalMem,
    memFree: freeMem,
    memUsed: usedMem,
    memPct: Math.round((usedMem / Math.max(1, totalMem)) * 100),
    processRss: process.memoryUsage().rss,
    ...disk,
    uptimeSec: os.uptime(),
    processUptimeSec: process.uptime(),
    ...net,
  };
}

async function readDisk(): Promise<{
  diskTotal: number | null;
  diskFree: number | null;
  diskUsed: number | null;
  diskPct: number | null;
}> {
  try {
    const stats = await statfs("/");
    const total = stats.blocks * stats.bsize;
    const free = stats.bavail * stats.bsize;
    const used = Math.max(0, total - free);
    return {
      diskTotal: total,
      diskFree: free,
      diskUsed: used,
      diskPct: total ? Math.round((used / total) * 100) : null,
    };
  } catch {
    return { diskTotal: null, diskFree: null, diskUsed: null, diskPct: null };
  }
}

/** /proc/net/dev + /proc/uptime (Linux VPS). Platform lain → null. */
async function readNetwork(uptimeSec: number): Promise<{
  netRxBytes: number | null;
  netTxBytes: number | null;
  netRxMbps: number | null;
  netTxMbps: number | null;
}> {
  try {
    const raw = await readFile("/proc/net/dev", "utf8");
    let rx = 0;
    let tx = 0;
    for (const line of raw.split("\n").slice(2)) {
      const [name, rest] = line.split(":");
      if (!name || !rest) continue;
      const iface = name.trim();
      if (iface === "lo" || iface.startsWith("docker") || iface.startsWith("veth")) continue;
      const cols = rest.trim().split(/\s+/);
      rx += Number(cols[0]) || 0;
      tx += Number(cols[8]) || 0;
    }
    if (!rx && !tx) return nullNetwork();
    const toMbps = (bytes: number) =>
      uptimeSec > 0 ? Math.round(((bytes * 8) / uptimeSec / 1_000_000) * 100) / 100 : null;
    return {
      netRxBytes: rx,
      netTxBytes: tx,
      netRxMbps: toMbps(rx),
      netTxMbps: toMbps(tx),
    };
  } catch {
    return nullNetwork();
  }
}

function nullNetwork() {
  return { netRxBytes: null, netTxBytes: null, netRxMbps: null, netTxMbps: null };
}

// ---------------------------------------------------------------------------
// Cloudflare: edge traffic + WAF/bot threats (24 jam terakhir)
// ---------------------------------------------------------------------------

const CF_EMPTY: CloudflareHealth = {
  configured: false,
  ok: false,
  requests: null,
  cachedRequests: null,
  cacheRatio: null,
  bytes: null,
  pageViews: null,
  uniques: null,
  threats: null,
  clientErrors: null,
  serverErrors: null,
  countries: [],
  error: null,
  missing: [],
};

type CfZone = {
  httpRequests1dGroups?: {
    sum?: {
      requests?: number;
      cachedRequests?: number;
      bytes?: number;
      threats?: number;
      pageViews?: number;
      countryMap?: { clientCountryName?: string; requests?: number; threats?: number }[];
      responseStatusMap?: { edgeResponseStatus?: number; requests?: number }[];
    };
    uniq?: { uniques?: number };
  }[];
};

// Dataset httpRequests1dGroups berbasis hari UTC; zoneTag wajib String!, bukan list.
async function readCloudflareHealth(): Promise<CloudflareHealth> {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const zoneId = process.env.CLOUDFLARE_ZONE_ID;
  if (!token || !zoneId) {
    return {
      ...CF_EMPTY,
      missing: [
        ...(token ? [] : ["CLOUDFLARE_API_TOKEN"]),
        ...(zoneId ? [] : ["CLOUDFLARE_ZONE_ID"]),
      ],
    };
  }

  const today = new Date().toISOString().slice(0, 10);
  const query = `query ZoneOverview($zoneTag: String!, $since: Date!, $until: Date!) {
    viewer {
      zones(filter: { zoneTag: $zoneTag }) {
        httpRequests1dGroups(limit: 1, filter: { date_geq: $since, date_leq: $until }) {
          sum {
            requests
            cachedRequests
            bytes
            threats
            pageViews
            countryMap { clientCountryName requests threats }
            responseStatusMap { edgeResponseStatus requests }
          }
          uniq { uniques }
        }
      }
    }
  }`;

  try {
    const res = await fetch("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        variables: { zoneTag: zoneId, since: today, until: today },
      }),
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });

    const payload = (await res.json()) as {
      data?: { viewer?: { zones?: CfZone[] } };
      errors?: { message?: string }[];
    };

    if (!res.ok || payload.errors?.length) {
      return {
        ...CF_EMPTY,
        configured: true,
        error: payload.errors?.[0]?.message ?? `HTTP ${res.status}`,
      };
    }

    const zone = payload.data?.viewer?.zones?.[0];
    const group = zone?.httpRequests1dGroups?.[0];
    const sum = group?.sum;
    const requests = sum?.requests ?? 0;
    const cached = sum?.cachedRequests ?? 0;

    const statusRows = sum?.responseStatusMap ?? [];
    const countStatus = (from: number, to: number) =>
      statusRows
        .filter((row) => (row.edgeResponseStatus ?? 0) >= from && (row.edgeResponseStatus ?? 0) < to)
        .reduce((total, row) => total + (row.requests ?? 0), 0);

    const countries = (sum?.countryMap ?? [])
      .filter((row) => row.clientCountryName)
      .map((row) => ({
        code: row.clientCountryName as string,
        requests: row.requests ?? 0,
        threats: row.threats ?? 0,
      }))
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 5);

    return {
      configured: true,
      ok: true,
      requests,
      cachedRequests: cached,
      cacheRatio: requests ? Math.round((cached / requests) * 1000) / 10 : null,
      bytes: sum?.bytes ?? 0,
      pageViews: sum?.pageViews ?? 0,
      uniques: group?.uniq?.uniques ?? 0,
      threats: sum?.threats ?? 0,
      clientErrors: countStatus(400, 500),
      serverErrors: countStatus(500, 600),
      countries,
      error: null,
      missing: [],
    };
  } catch (error) {
    return {
      ...CF_EMPTY,
      configured: true,
      error: error instanceof Error ? error.message : "Gagal menghubungi Cloudflare",
    };
  }
}
