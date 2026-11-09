/**
 * Merge branding global + override booth — SATU sumber logika untuk server
 * (`buildPublicConfig`), builder dashboard, dan validasi kontras.
 *
 * Murni: tanpa `server-only`, tanpa alias `@/`. Impor relatif `.ts` supaya
 * bisa dijalankan langsung oleh `node --experimental-strip-types` di tes.
 */

import type { BrandingConfig, KioskPageConfig } from "./kiosk-types.ts";

type Row = Record<string, unknown>;

function isPlainObject(value: unknown): value is Row {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Salin hanya key yang terkirim (undefined = inherit, bukan menimpa). */
function definedEntries(input: unknown): Row {
  if (!isPlainObject(input)) return {};
  const out: Row = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function mergePages(globalPages: unknown, overridePages: unknown): Record<string, KioskPageConfig> {
  const g = isPlainObject(globalPages) ? globalPages : {};
  const o = isPlainObject(overridePages) ? overridePages : {};
  const pages: Record<string, KioskPageConfig> = {};
  for (const key of new Set([...Object.keys(g), ...Object.keys(o)])) {
    const mergedPage = {
      ...definedEntries(g[key]),
      ...definedEntries(o[key]),
    };
    if (Object.keys(mergedPage).length > 0) {
      pages[key] = mergedPage as KioskPageConfig;
    }
  }
  return pages;
}

/**
 * Global + override booth, deep-merge pada `kiosk` dan `kiosk.pages`.
 * Override hanya menang untuk field yang benar-benar dikirim; key `undefined`
 * berarti "warisi global". `null` adalah nilai eksplisit (mis. hapus video).
 */
export function mergeBranding(
  global: BrandingConfig | null | undefined,
  override: BrandingConfig | null | undefined
): BrandingConfig {
  const g = definedEntries(global);
  const o = definedEntries(override);
  const merged: Row = { ...g, ...o };

  const gk = isPlainObject(g.kiosk) ? g.kiosk : {};
  const ok = isPlainObject(o.kiosk) ? o.kiosk : {};
  const kiosk: Row = { ...definedEntries(gk), ...definedEntries(ok) };
  delete kiosk.pages;

  const pages = mergePages(gk.pages, ok.pages);
  if (Object.keys(pages).length > 0) kiosk.pages = pages;

  if (Object.keys(kiosk).length > 0) merged.kiosk = kiosk;
  else delete merged.kiosk;

  return merged as BrandingConfig;
}

/**
 * True bila override memang berisi setidaknya satu nilai (rekursif).
 * `null`/`{}`/`{ kiosk: {} }` = tidak ada override → booth mewarisi global.
 */
export function brandingHasOverride(input: unknown): boolean {
  if (input === null || input === undefined) return false;
  if (!isPlainObject(input)) return true;
  return Object.values(input).some((value) =>
    isPlainObject(value) ? brandingHasOverride(value) : value !== undefined
  );
}

/**
 * Key storage branding yang TIDAK berada di prefix business sendiri.
 * Server action menerima argumen yang tidak bisa dipercaya: tanpa cek ini
 * tenant A bisa menulis `logo_key` milik tenant B lalu mendapat signed URL-nya
 * lewat public config. Key kosong/null = inherit (sah).
 */
export function foreignBrandAssetKeys(
  businessId: string,
  branding: BrandingConfig | null | undefined
): string[] {
  const prefix = `${businessId}/`;
  const keys: string[] = [];
  const check = (value: unknown) => {
    if (typeof value !== "string" || value === "") return;
    if (!value.startsWith(prefix)) keys.push(value);
  };
  if (!isPlainObject(branding)) return keys;
  check(branding.logo_key);
  const kiosk = isPlainObject(branding.kiosk) ? branding.kiosk : {};
  check(kiosk.video_key);
  for (const page of Object.values(isPlainObject(kiosk.pages) ? kiosk.pages : {})) {
    if (isPlainObject(page)) check(page.video_key);
  }
  return keys;
}

/**
 * Hapus field branding berdasarkan path bertitik (`kiosk.show_logo`,
 * `kiosk.pages.edit.padding`, `logo_key`). Dipakai tombol "Hapus"/"Default"
 * global: merge biasa mempertahankan key yang tidak dikirim, jadi penghapusan
 * harus eksplisit. Murni dan tidak memutasi masukan.
 */
export function unsetBrandingPaths<T>(branding: T, paths: readonly string[]): T {
  if (!isPlainObject(branding) || paths.length === 0) return branding;
  const root: Row = structuredClone(branding);
  for (const path of paths) {
    const segments = path.split(".").filter(Boolean);
    if (segments.length === 0) continue;
    let node: unknown = root;
    for (let i = 0; i < segments.length - 1; i += 1) {
      if (!isPlainObject(node)) break;
      node = node[segments[i]!];
    }
    if (isPlainObject(node)) delete node[segments[segments.length - 1]!];
  }
  return root as T;
}

/**
 * True bila warna yang divalidasi kontras (kiosk bg/text + tiap layar)
 * berbeda antar dua branding. Dipakai agar unggah aset tidak ditolak oleh
 * kontras branding lama yang sudah tersimpan.
 */
export function brandingColorsChanged(
  a: BrandingConfig | null | undefined,
  b: BrandingConfig | null | undefined
): boolean {
  const colors = (input: BrandingConfig | null | undefined) => {
    const kiosk = isPlainObject(input?.kiosk) ? input!.kiosk! : {};
    const pages = isPlainObject(kiosk.pages) ? kiosk.pages : {};
    return JSON.stringify({
      bg: kiosk.bg_color ?? null,
      text: kiosk.text_color ?? null,
      pages: Object.keys(pages)
        .sort()
        .map((key) => {
          const page = (pages as Record<string, unknown>)[key];
          if (!isPlainObject(page)) return [key, null, null];
          return [key, page.bg_color ?? null, page.text_color ?? null];
        }),
    });
  };
  return colors(a) !== colors(b);
}

/**
 * Semantik simpan override:
 * - `merge` (default, kompatibel): tempel input di atas override lama.
 * - `replace` (builder): pakai input apa adanya; field yang tidak dikirim =
 *   inherit global. `{}`/`null` = hapus override (kolom branding = null).
 */
export function resolveBoothOverride(
  existing: BrandingConfig | null | undefined,
  input: BrandingConfig | null | undefined,
  mode: "merge" | "replace"
): BrandingConfig | null {
  if (!brandingHasOverride(input)) return null;
  if (mode === "replace") return definedEntries(input) as BrandingConfig;
  return mergeBranding(existing, input);
}
