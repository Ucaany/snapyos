/**
 * Cache template kiosk — modul MURNI (tanpa window/localStorage/fetch).
 *
 * Dipakai dua sisi:
 * - server (`public-config.ts`) untuk membentuk parameter `cache` proxy frame;
 * - klien (`components/kiosk/template-cache.ts`) untuk menyusun rencana warm.
 *
 * Key aset memakai identitas stabil `templateId:version`, BUKAN signed URL:
 * signed URL berubah tiap jam sehingga cache berbasis URL selalu miss.
 */

import type { PublicTemplate } from "./kiosk-types.ts";

/**
 * Tag cache public config — bagian dari kontrak invalidasi (server memanggil
 * `updateTag` dengan tag ini). Murni agar bisa diuji tanpa Next runtime.
 */
export const PUBLIC_CONFIG_GLOBAL_TAG = "public-config:global";

/** Tag per-business + tag global (template global mengubah kiosk semua tenant). */
export function publicConfigCacheTags(businessId: string): string[] {
  return [`business:${businessId}:public-config`, PUBLIC_CONFIG_GLOBAL_TAG];
}

/** Nama Cache Storage untuk biner thumbnail + frame penuh. */
export const TEMPLATE_CACHE_NAME = "snapyos-template-assets-v1";
/** Prefix key localStorage snapshot daftar template. */
export const TEMPLATE_SNAPSHOT_PREFIX = "snapyos.templates.";
/** Prefix key localStorage index aset (bytes + LRU). */
export const TEMPLATE_INDEX_PREFIX = "snapyos.template-index.";

export type AssetKind = "thumb" | "full";

/** Snapshot daftar template — dibaca sinkron agar render pertama tanpa skeleton. */
export type Snapshot = { schema: 1; fetchedAt: number; templates: PublicTemplate[] };

export type AssetIndexEntry = { key: string; bytes: number; lastUsed: number };
export type AssetIndex = { schema: 1; entries: AssetIndexEntry[] };

export type WarmAsset = { key: string; url: string };
export type WarmPlan = {
  thumbs: WarmAsset[];
  frames: WarmAsset[];
  /** Template hilang dari daftar → key aman dihapus sekarang. */
  prune: string[];
  /** templateId → key versi lama (hapus SETELAH pengganti tersimpan). */
  stale: Record<string, string[]>;
};

function normalizeVersion(version: number | null | undefined): number {
  return typeof version === "number" && Number.isFinite(version) ? version : 0;
}

/** `${id}:${version}@480` (thumb) atau `${id}:${version}@full` (frame). */
export function assetKey(
  templateId: string,
  version: number | null | undefined,
  kind: AssetKind
): string {
  return `${templateId}:${normalizeVersion(version)}@${kind === "thumb" ? "480" : "full"}`;
}

/** Basis key tanpa suffix kind — nilai parameter `?cache=` proxy frame. */
export function templateCacheKey(templateId: string, version: number | null | undefined): string {
  return `${templateId}:${normalizeVersion(version)}`;
}

export type ParsedAssetKey = { templateId: string; version: number; kind: AssetKind };

/** Kebalikan `assetKey`; `null` untuk key asing (dipangkas saat warm). */
export function parseAssetKey(key: string): ParsedAssetKey | null {
  const match = /^(.+):(\d+)@(480|full)$/.exec(key);
  if (!match) return null;
  const [, templateId = "", version = "0", suffix = "full"] = match;
  return {
    templateId,
    version: Number(version),
    kind: suffix === "480" ? "thumb" : "full",
  };
}

/**
 * URL key Cache Storage untuk satu aset.
 *
 * WAJIB identik dengan logika di `public/sw.js`: basis key di-encode, suffix
 * kind ditempel di luar encoding (`/__frame/<base>@480`). SW membentuk URL yang
 * sama dari `?cache=` + `?w=`.
 */
export function frameCacheUrl(origin: string, key: string): string {
  const at = key.lastIndexOf("@");
  const base = at === -1 ? key : key.slice(0, at);
  const suffix = at === -1 ? "full" : key.slice(at + 1);
  return `${origin}/__frame/${encodeURIComponent(base)}@${suffix}`;
}

/** Assignment package mempersempit, tapi tidak pernah mengosongkan daftar. */
export function filterTemplatesForPackage(
  templates: readonly PublicTemplate[],
  packageId: string
): PublicTemplate[] {
  const matched = templates.filter((t) => (t.package_ids ?? []).includes(packageId));
  return matched.length > 0 ? matched : [...templates];
}

/** Key index milik template yang tidak ada lagi di daftar segar. */
export function removedKeys(fresh: readonly PublicTemplate[], index: AssetIndex): string[] {
  const live = new Set(fresh.map((t) => t.id));
  return index.entries
    .filter((entry) => {
      const parsed = parseAssetKey(entry.key);
      return !parsed || !live.has(parsed.templateId);
    })
    .map((entry) => entry.key);
}

/** Key index untuk template yang masih ada tetapi versinya sudah berubah. */
export function staleKeys(fresh: readonly PublicTemplate[], index: AssetIndex): string[] {
  const versions = new Map(fresh.map((t) => [t.id, normalizeVersion(t.version)]));
  return index.entries
    .filter((entry) => {
      const parsed = parseAssetKey(entry.key);
      if (!parsed) return false;
      const version = versions.get(parsed.templateId);
      return version !== undefined && version !== parsed.version;
    })
    .map((entry) => entry.key);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Snapshot rusak / schema asing → `null` (pemanggil mereset cache sekali). */
export function parseSnapshot(raw: string | null): Snapshot | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;
  if (value.schema !== 1) return null;
  if (typeof value.fetchedAt !== "number" || !Number.isFinite(value.fetchedAt)) return null;
  if (!Array.isArray(value.templates)) return null;
  const templates = value.templates.filter(
    (t): t is PublicTemplate =>
      isRecord(t) && typeof t.id === "string" && typeof t.file_url === "string"
  );
  return { schema: 1, fetchedAt: value.fetchedAt, templates };
}

/** Index rusak → index kosong (cache dianggap belum tersimpan). */
export function parseIndex(raw: string | null): AssetIndex {
  if (!raw) return { schema: 1, entries: [] };
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { schema: 1, entries: [] };
  }
  if (!isRecord(value) || value.schema !== 1 || !Array.isArray(value.entries)) {
    return { schema: 1, entries: [] };
  }
  const entries = value.entries.filter(
    (e): e is AssetIndexEntry =>
      isRecord(e) &&
      typeof e.key === "string" &&
      typeof e.bytes === "number" &&
      Number.isFinite(e.bytes) &&
      e.bytes >= 0 &&
      typeof e.lastUsed === "number" &&
      Number.isFinite(e.lastUsed)
  );
  return { schema: 1, entries };
}

/**
 * Rencana unduh deterministik: idempoten terhadap input yang sama.
 * Aset yang key-nya sudah ada di index tidak pernah diminta ulang.
 */
export function planWarm(fresh: readonly PublicTemplate[], index: AssetIndex): WarmPlan {
  const have = new Set(index.entries.map((entry) => entry.key));
  const thumbs: WarmAsset[] = [];
  const frames: WarmAsset[] = [];

  for (const t of fresh) {
    const thumbKey = assetKey(t.id, t.version, "thumb");
    if (!have.has(thumbKey)) thumbs.push({ key: thumbKey, url: t.thumbnail_url || t.file_url });
    const frameKey = assetKey(t.id, t.version, "full");
    if (!have.has(frameKey)) frames.push({ key: frameKey, url: t.file_url });
  }

  const stale: Record<string, string[]> = {};
  for (const key of staleKeys(fresh, index)) {
    const parsed = parseAssetKey(key);
    if (!parsed) continue;
    (stale[parsed.templateId] ??= []).push(key);
  }

  return { thumbs, frames, prune: removedKeys(fresh, index), stale };
}

export function summarizeIndex(index: AssetIndex): { totalBytes: number } {
  return {
    totalBytes: index.entries.reduce((sum, entry) => sum + Math.max(0, entry.bytes), 0),
  };
}

/**
 * Key LRU yang perlu dibuang agar ruang cukup. Key dengan kind di `keepKinds`
 * (thumbnail) TIDAK PERNAH dipilih — grid harus tetap tampil offline.
 */
export function pickEvictions(
  index: AssetIndex,
  needBytes: number,
  keepKinds: readonly AssetKind[] = ["thumb"]
): string[] {
  let needed = needBytes;
  if (!(needed > 0)) return [];
  const candidates = index.entries
    .filter((entry) => {
      const parsed = parseAssetKey(entry.key);
      return !parsed || !keepKinds.includes(parsed.kind);
    })
    .sort((a, b) => a.lastUsed - b.lastUsed);

  const evicted: string[] = [];
  for (const entry of candidates) {
    if (needed <= 0) break;
    evicted.push(entry.key);
    needed -= Math.max(0, entry.bytes);
  }
  return evicted;
}
