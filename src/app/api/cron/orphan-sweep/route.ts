import { createServerClient } from "@/lib/supabase/server";
import { bearerMatches } from "@/lib/cron-auth";
import { activeStorageProviders } from "@/server/storage";
import { accountStorageSub } from "@/server/storage-usage";
import { groupKeysByBusiness, selectOrphans, type SweepObject } from "@/lib/orphan-sweep";
import { splitRemoveOutcome } from "@/lib/r2/remove-outcome";
import type { StorageBucket, StorageProvider } from "@/server/storage/types";

/**
 * Cron orphan sweep `generated-photos` — hemat biaya R2.
 *
 * Objek yang tidak direferensikan `sessions.result_gif_key` /
 * `sessions.result_photos_gif_key` / `photos.file_key`
 * (mis. finalize gagal setelah upload) tetap menagih storage selamanya. Sweep
 * menghapusnya, tetapi HANYA yang umurnya > 24 jam agar upload yang sedang
 * berjalan tidak ikut tersapu.
 *
 * Batasan yang disengaja (biaya terkendali):
 * - `MAX_SCAN_PER_RUN` objek dipindai per run (paginated per business).
 * - `MAX_DELETE_PER_RUN` objek dihapus per run — backlog tersalirkan harian.
 * - `dry_run` = `?dry_run=1` atau env `ORPHAN_SWEEP_DRY_RUN=1`: laporkan tanpa
 *   menghapus apa pun.
 *
 * Akuntansi: `used_bytes` hanya dikurangi untuk key yang dilaporkan BERHASIL
 * (atau sudah absen) — HTTP 200 DeleteObjects bukan bukti sukses.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BUCKET: StorageBucket = "generated-photos";
const MIN_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_SCAN_PER_RUN = 2000;
const MAX_DELETE_PER_RUN = 500;
const DB_KEY_CHUNK = 200;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret && secret.startsWith("change-me")) return false;
  if (!secret) {
    if (process.env.NODE_ENV === "production") return false;
    return process.env.ORPHAN_SWEEP_CRON_OPEN === "1";
  }
  return bearerMatches(request.headers.get("authorization"), secret);
}

type Candidate = SweepObject & { provider: StorageProvider };

/** Semua direktori bisnis (level 1) di bucket, lintas provider aktif. */
async function listBusinessFolders(): Promise<string[]> {
  const names = new Set<string>();
  for (const provider of activeStorageProviders()) {
    const { data, error } = await provider.list(BUCKET, "", { limit: 1000, offset: 0 });
    if (error) {
      console.error(
        `[cron/orphan-sweep] list root gagal provider=${provider.name}:`,
        error.message
      );
      continue;
    }
    for (const entry of data ?? []) {
      if (entry.id === null && entry.name) names.add(entry.name);
    }
  }
  return [...names].sort();
}

/** Rekursif satu business, dibatasi `budget` objek agar run tetap terukur. */
async function collectBusinessObjects(businessId: string, budget: number): Promise<Candidate[]> {
  const out: Candidate[] = [];
  if (budget <= 0) return out;
  const stack: string[] = [businessId];
  while (stack.length > 0 && out.length < budget) {
    const dir = stack.pop()!;
    for (const provider of activeStorageProviders()) {
      let offset = 0;
      const limit = 500;
      for (;;) {
        const { data, error } = await provider.list(BUCKET, dir, { limit, offset });
        if (error) {
          console.error(
            `[cron/orphan-sweep] list gagal dir=${dir} provider=${provider.name}:`,
            error.message
          );
          break;
        }
        const items = data ?? [];
        for (const item of items) {
          if (item.id === null) {
            stack.push(`${dir}/${item.name}`);
            continue;
          }
          const lastModifiedMs = Date.parse(item.metadata?.lastModified ?? "");
          out.push({
            key: item.id,
            bytes: item.metadata?.size ?? 0,
            lastModifiedMs,
            provider,
          });
          if (out.length >= budget) break;
        }
        if (out.length >= budget) break;
        offset += items.length;
        if (items.length < limit) break;
      }
      if (out.length >= budget) break;
    }
  }
  return out;
}

/** Key yang MASIH direferensikan DB (photo + GIF) untuk kandidat tertentu. */
async function referencedKeys(candidates: string[]): Promise<Set<string>> {
  const supabase = createServerClient();
  const referenced = new Set<string>();
  for (let i = 0; i < candidates.length; i += DB_KEY_CHUNK) {
    const chunk = candidates.slice(i, i + DB_KEY_CHUNK);
    const [photos, sessions, photosGifSessions] = await Promise.all([
      supabase.from("photos").select("file_key").in("file_key", chunk),
      supabase.from("sessions").select("result_gif_key").in("result_gif_key", chunk),
      supabase.from("sessions").select("result_photos_gif_key").in("result_photos_gif_key", chunk),
    ]);
    if (photos.error) {
      // Fail-closed: error kueri berarti kita TIDAK tahu apa yang direferensikan.
      throw new Error(`gagal memuat photos.file_key: ${photos.error.message}`);
    }
    if (sessions.error) {
      throw new Error(`gagal memuat sessions.result_gif_key: ${sessions.error.message}`);
    }
    if (photosGifSessions.error) {
      throw new Error(
        `gagal memuat sessions.result_photos_gif_key: ${photosGifSessions.error.message}`
      );
    }
    for (const row of (photos.data ?? []) as { file_key: string }[]) {
      if (row.file_key) referenced.add(row.file_key);
    }
    for (const row of (sessions.data ?? []) as { result_gif_key: string | null }[]) {
      if (row.result_gif_key) referenced.add(row.result_gif_key);
    }
    for (const row of (photosGifSessions.data ?? []) as {
      result_photos_gif_key: string | null;
    }[]) {
      if (row.result_photos_gif_key) referenced.add(row.result_photos_gif_key);
    }
  }
  return referenced;
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET && process.env.NODE_ENV === "production") {
    console.error("[cron/orphan-sweep] CRON_SECRET tidak diset (misconfig)");
    return Response.json(
      { error: { code: "INTERNAL", message: "CRON_SECRET not configured" } },
      { status: 500 }
    );
  }
  if (!authorized(request)) {
    return Response.json(
      { error: { code: "UNAUTHORIZED", message: "Unauthorized" } },
      { status: 401 }
    );
  }

  const url = new URL(request.url);
  const dryRun =
    url.searchParams.get("dry_run") === "1" || process.env.ORPHAN_SWEEP_DRY_RUN === "1";
  const now = Date.now();

  const businesses = await listBusinessFolders();
  const scanned: Candidate[] = [];
  for (const businessId of businesses) {
    const remaining = MAX_SCAN_PER_RUN - scanned.length;
    if (remaining <= 0) break;
    scanned.push(...(await collectBusinessObjects(businessId, remaining)));
  }

  if (scanned.length === 0) {
    return Response.json({ data: { scanned: 0, orphans: 0, deleted: 0, dryRun } });
  }

  let referenced: Set<string>;
  try {
    referenced = await referencedKeys(scanned.map((o) => o.key));
  } catch (error) {
    // Tanpa daftar referensi yang pasti, menghapus apa pun berisiko kehilangan
    // media pelanggan. Berhenti, biarkan run berikutnya mencoba.
    console.error(
      "[cron/orphan-sweep] gagal memuat referensi DB, sweep dibatalkan:",
      error instanceof Error ? error.message : error
    );
    return Response.json(
      { error: { code: "INTERNAL", message: "Gagal memuat referensi; sweep dibatalkan" } },
      { status: 500 }
    );
  }

  const selection = selectOrphans(scanned, referenced, now, MIN_AGE_MS, MAX_DELETE_PER_RUN);
  const orphans = selection.orphans;
  if (orphans.length === 0) {
    return Response.json({
      data: {
        scanned: scanned.length,
        orphans: 0,
        deleted: 0,
        referenced: selection.skippedReferenced,
        young: selection.skippedYoung,
        dryRun,
      },
    });
  }

  if (dryRun) {
    return Response.json({
      data: {
        scanned: scanned.length,
        orphans: orphans.length,
        deleted: 0,
        referenced: selection.skippedReferenced,
        young: selection.skippedYoung,
        dryRun: true,
        sample: orphans.slice(0, 20).map((o) => o.key),
      },
    });
  }

  // Hapus per provider (objek berasal dari listing, jadi provider diketahui).
  const okKeys: string[] = [];
  const failures: string[] = [];
  const byProvider = new Map<StorageProvider, Candidate[]>();
  for (const orphan of orphans) {
    const list = byProvider.get(orphan.provider) ?? [];
    list.push(orphan);
    byProvider.set(orphan.provider, list);
  }
  for (const [provider, group] of byProvider) {
    const keys = group.map((o) => o.key);
    const { error } = await provider.remove(BUCKET, keys);
    const outcome = splitRemoveOutcome(keys, error);
    okKeys.push(...outcome.ok);
    failures.push(...outcome.failures.map((f) => f.key));
  }

  // Akuntansi hanya untuk key yang benar-benar terhapus — bila gagal, ledger
  // tetap memuatnya dan sweep run berikutnya mencoba lagi.
  let accounted = 0;
  for (const [businessId, keys] of groupKeysByBusiness(okKeys)) {
    const outcome = await accountStorageSub(businessId, keys);
    if (outcome.ok) accounted += keys.length;
    else if (!outcome.missing) {
      console.error(
        `[cron/orphan-sweep] account_sub gagal business=${businessId}: ${outcome.error ?? "unknown"}`
      );
    } else {
      accounted += keys.length;
    }
  }

  console.log(
    `[cron/orphan-sweep] scan=${scanned.length} orphan=${orphans.length} deleted=${okKeys.length} accounting_failed=${failures.length} accounted=${accounted}`
  );
  return Response.json({
    data: {
      scanned: scanned.length,
      orphans: orphans.length,
      deleted: okKeys.length,
      failed: failures.length,
      referenced: selection.skippedReferenced,
      young: selection.skippedYoung,
      dryRun: false,
    },
  });
}
