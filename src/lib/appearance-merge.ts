/**
 * Kustomisasi tampilan booth: nilai mesin menang atas nilai cloud.
 *
 * Alur yang dijaga berkas ini:
 *
 * 1. **Cloud** mengirim *identitas & informasi* — nama bisnis, logo, warna brand
 *    primary/secondary, aset video, harga, paket, payment gateway.
 * 2. **Aplikasi booth** menyimpan *tampilan satu booth* — warna latar, warna
 *    teks, tipografi, radius, padding, perataan, judul/hint tiap layar,
 *    panduan, dan override per-layar.
 *
 * Nilai booth menang karena hanya mesin di lokasi yang tahu layarnya: teks yang
 * muat di booth A belum tentu muat di booth B dengan rasio berbeda. Karena itu
 * `appearance_settings` hidup di store lokal booth (`PUT /v1/settings`) dan
 * TIDAK pernah dikirim ke cloud — lihat `LOCAL_ONLY_DEVICE_GROUPS`.
 *
 * Modul ini murni (tanpa `@/`, tanpa `server-only`) supaya bisa diuji langsung
 * dan dipakai komponen kiosk tanpa menarik bundel server.
 */

import type { BrandingConfig, KioskPageConfig, KioskPageId } from "./kiosk-types.ts";

/** Bentuk `appearance_settings` seperti yang disimpan runtime lokal. */
export type AppearanceSettings = {
  bg_color?: string;
  text_color?: string;
  font_family?: "display" | "sans" | "mono";
  font_scale?: number;
  button_radius?: number;
  padding?: number;
  align?: "left" | "center" | "right";
  welcome_layout?: "split-left" | "split-right" | "center";
  result_layout?: "qr-right" | "qr-left" | "qr-below";
  welcome_title?: string;
  welcome_tagline?: string;
  welcome_button?: string;
  payment_title?: string;
  payment_hint?: string;
  capture_title?: string;
  capture_hint?: string;
  editor_title?: string;
  editor_hint?: string;
  result_title?: string;
  result_hint?: string;
  guide_title?: string;
  guide_button?: string;
  package_title?: string;
  template_title?: string;
  show_logo?: boolean;
  show_tagline?: boolean;
  show_mirror_toggle?: boolean;
  allow_zoom_pan?: boolean;
  guide_steps?: string[];
  pages?: Partial<Record<KioskPageId, AppearancePageSettings>>;
};

export type AppearancePageSettings = {
  bg_color?: string;
  text_color?: string;
  font_scale?: number;
  button_radius?: number;
  padding?: number;
  align?: "left" | "center" | "right";
  /** Kustomisasi elemen layar ini — urut, geser, sembunyi, teks. */
  elements?: Record<
    string,
    { visible?: boolean; order?: number; offset_x?: number; offset_y?: number; text?: string }
  >;
};

/**
 * Field kustomisasi yang boleh datang dari booth. Dipakai panel setelan untuk
 * memastikan hanya field ini yang dikirim ke `PUT /v1/settings`, dan oleh tes
 * agar daftar ini tidak pernah menyimpang dari schema zod.
 */
export const APPEARANCE_FIELDS = [
  "bg_color",
  "text_color",
  "font_family",
  "font_scale",
  "button_radius",
  "padding",
  "align",
  "welcome_layout",
  "result_layout",
  "welcome_title",
  "welcome_tagline",
  "welcome_button",
  "payment_title",
  "payment_hint",
  "capture_title",
  "capture_hint",
  "editor_title",
  "editor_hint",
  "result_title",
  "result_hint",
  "guide_title",
  "guide_button",
  "package_title",
  "template_title",
  "show_logo",
  "show_tagline",
  "show_mirror_toggle",
  "allow_zoom_pan",
  "guide_steps",
  "pages",
] as const;

/** Layar yang bisa di-override per-layar (cermin `KioskPageId`). */
export const APPEARANCE_PAGES: readonly KioskPageId[] = [
  "welcome",
  "guide",
  "package",
  "payment",
  "template",
  "capture",
  "edit",
  "result",
];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Buang `undefined` dan kunci yang bukan milik kustomisasi booth. */
export function pickAppearance(input: unknown): AppearanceSettings {
  if (!isPlainObject(input)) return {};
  const allowed = new Set<string>(APPEARANCE_FIELDS);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!allowed.has(key) || value === undefined) continue;
    if (key === "pages") {
      if (!isPlainObject(value)) continue;
      const pages: Record<string, AppearancePageSettings> = {};
      for (const page of APPEARANCE_PAGES) {
        const row = (value as Record<string, unknown>)[page];
        if (!isPlainObject(row)) continue;
        const clean: Record<string, unknown> = {};
        for (const field of [
          "bg_color",
          "text_color",
          "font_scale",
          "button_radius",
          "padding",
          "align",
          "elements",
        ]) {
          if (row[field] !== undefined) clean[field] = row[field];
        }
        if (Object.keys(clean).length > 0) {
          pages[page] = clean as AppearancePageSettings;
        }
      }
      if (Object.keys(pages).length > 0) out.pages = pages;
      continue;
    }
    out[key] = value;
  }
  return out as AppearanceSettings;
}

/**
 * Tempelkan kustomisasi booth di atas branding cloud.
 *
 * `null`/kosong berarti booth belum pernah dikustomisasi → branding cloud
 * dipakai apa adanya. Field yang tidak disebut booth tetap milik cloud, jadi
 * logo, warna brand, dan video tidak pernah hilang hanya karena operator
 * mengubah satu judul layar.
 */
export function mergeAppearance(
  cloud: BrandingConfig | null | undefined,
  appearance: AppearanceSettings | null | undefined
): BrandingConfig {
  const base: BrandingConfig = cloud ? { ...cloud } : {};
  if (!appearance || Object.keys(appearance).length === 0) return base;

  const next: BrandingConfig = { ...base };
  // Field tingkat atas `BrandingConfig` yang boleh ditimpa booth.
  for (const key of ["welcome_title", "welcome_tagline", "welcome_button"] as const) {
    const value = appearance[key];
    if (value !== undefined) next[key] = value;
  }

  // `kiosk` = seluruh tampilan kiosk; digabung per-field.
  const cloudKiosk = isPlainObject(base.kiosk) ? { ...base.kiosk } : {};
  const deviceKiosk: Record<string, unknown> = {};
  for (const key of APPEARANCE_FIELDS) {
    if (key === "pages") continue;
    if (key === "welcome_title" || key === "welcome_tagline" || key === "welcome_button") continue;
    const value = (appearance as Record<string, unknown>)[key];
    if (value !== undefined) deviceKiosk[key] = value;
  }

  // Override per-layar: gabung per layar, booth menang per-field. `video_key`
  // tetap milik cloud — mesin tidak boleh mengarang objek storage.
  const cloudPages = isPlainObject(cloudKiosk.pages)
    ? (cloudKiosk.pages as Record<string, KioskPageConfig>)
    : {};
  const devicePages = appearance.pages ?? {};
  const pages: Record<string, KioskPageConfig> = { ...cloudPages };
  for (const page of APPEARANCE_PAGES) {
    const devicePage = devicePages[page];
    if (!devicePage) continue;
    const cloudPage = cloudPages[page] ?? {};
    const mergedPage: KioskPageConfig = { ...cloudPage };
    for (const [field, value] of Object.entries(devicePage)) {
      if (value === undefined) continue;
      (mergedPage as Record<string, unknown>)[field] = value;
    }
    pages[page] = mergedPage;
  }

  next.kiosk = {
    ...cloudKiosk,
    ...deviceKiosk,
    ...(Object.keys(pages).length > 0 ? { pages } : {}),
  } as BrandingConfig["kiosk"];
  return next;
}
