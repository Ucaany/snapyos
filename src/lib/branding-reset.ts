/**
 * Allowlist path reset branding — murni, tanpa `server-only`, agar bisa diuji
 * langsung dengan `node --experimental-strip-types`. File server action
 * (`"use server"`) tidak boleh mengekspor fungsi sinkron, jadi helper ini
 * dipisah ke modul biasa.
 *
 * Allowlist diturunkan dari shape schema (`brandingSchema`, `kioskBrandingSchema`,
 * `kioskPageSchema`) supaya tidak drift saat field baru ditambah.
 */

import {
  brandingSchema,
  kioskBrandingSchema,
  kioskPageIdSchema,
  kioskPageSchema,
} from "./validators.ts";

const TOP_LEVEL_KEYS = new Set(Object.keys(brandingSchema.shape));
const KIOSK_KEYS = new Set(Object.keys(kioskBrandingSchema.shape));
const PAGE_FIELD_KEYS = new Set(Object.keys(kioskPageSchema.shape));
const PAGE_IDS = new Set<string>(kioskPageIdSchema.options);

/** Segmen path aman: tidak kosong, bukan traversal, tanpa backslash. */
function isSafeSegment(segment: string): boolean {
  return segment.length > 0 && segment !== ".." && !segment.includes("\\");
}

/**
 * Saring path reset dari klien. Hanya field branding yang punya kontrol
 * hapus di builder yang diizinkan:
 * - key top-level `brandingSchema` (mis. `primary_color`, `welcome_title`)
 * - key `kioskBrandingSchema` (mis. `kiosk.bg_color`, `kiosk.video_key`)
 * - `kiosk.pages.<page>` (reset seluruh override layar)
 * - `kiosk.pages.<page>.<field>` (field layar: bg_color, text_color, dst.)
 */
export function sanitizeResetKeys(paths: unknown): string[] {
  if (!Array.isArray(paths)) return [];
  return paths.filter((path): path is string => {
    if (typeof path !== "string") return false;
    const segments = path.split(".");
    if (!segments.every(isSafeSegment)) return false;
    if (segments.length === 1) return TOP_LEVEL_KEYS.has(segments[0]!);
    if (segments.length === 2) {
      return segments[0] === "kiosk" && KIOSK_KEYS.has(segments[1]!);
    }
    if (segments.length === 3) {
      return segments[0] === "kiosk" && segments[1] === "pages" && PAGE_IDS.has(segments[2]!);
    }
    if (segments.length === 4) {
      return (
        segments[0] === "kiosk" &&
        segments[1] === "pages" &&
        PAGE_IDS.has(segments[2]!) &&
        PAGE_FIELD_KEYS.has(segments[3]!)
      );
    }
    return false;
  });
}
