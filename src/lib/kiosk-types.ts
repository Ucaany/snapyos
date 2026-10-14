/**
 * Tipe bersama server + client untuk customer photobox (docs/05 v2).
 * Murni tipe — tanpa "server-only" agar bisa diimpor komponen client.
 */

import type { TemplateLayout } from "@/lib/template-layout"
import { defaultBrandColors } from "./brand-defaults.ts"

/**
 * Tipe kiosk payment method canonical (dipakai client + server).
 * Diletakkan di kiosk-types supaya module boundary tetap jelas:
 * `src/lib/kiosk-types.ts` = universal (client-safe),
 * `src/server/payment/kiosk-payment.ts` = impl builder + helper.
 */
export type KioskPaymentDisplay = "qris" | "va" | "redirect" | "voucher" | "cash"
export type KioskPaymentKind = "gateway" | "voucher" | "cash"
export type KioskPaymentMethod = {
  id: string
  kind: KioskPaymentKind
  display: KioskPaymentDisplay
  label: string
  provider: "midtrans" | "tripay" | "pakasir" | null
  method: string | null
  hint: string | null
}

export type KioskFontFamily = "display" | "sans" | "mono"

/** Pemetaan font_family → CSS var font SnapyOS (lihat tokens.css §fonts). */
export const KIOSK_FONT_FAMILIES: Record<KioskFontFamily, string> = {
  display: "var(--font-display)",
  sans: "var(--font-body)",
  mono: "var(--font-mono)",
}

export type KioskBrandingConfig = {
  bg_color?: string
  text_color?: string
  /** Font family judul/label kiosk (default = display). */
  font_family?: KioskFontFamily
  font_scale?: number
  button_radius?: number
  padding?: number
  /** Perataan konten semua layar — kiri/tengah/kanan (full element). */
  align?: KioskPageAlign
  welcome_layout?: "split-left" | "split-right" | "center"
  payment_align?: "left" | "center"
  result_layout?: "qr-right" | "qr-left" | "qr-below"
  payment_title?: string
  payment_hint?: string
  capture_title?: string
  capture_hint?: string
  editor_title?: string
  editor_hint?: string
  result_title?: string
  result_hint?: string
  guide_title?: string
  guide_button?: string
  package_title?: string
  template_title?: string
  show_logo?: boolean
  show_tagline?: boolean
  /** Storage key bucket business-assets (URL di-sign saat render) — null = tanpa video. */
  video_key?: string | null
  /** Signed URL video background (bucket private) — diisi server saat render. */
  video_url?: string | null
  /** Override visual per layar — menimpa nilai global di atas. */
  pages?: Partial<Record<KioskPageId, KioskPageConfig>>
  guide_steps?: string[]
  /** Tampilkan tombol mirror di layar kamera customer (default true). */
  show_mirror_toggle?: boolean
  /** Izinkan customer zoom/pan foto di editor (default true). */
  allow_zoom_pan?: boolean
}

/** Layar kiosk customer yang bisa dikustomisasi per-layar. */
export type KioskPageId =
  "welcome" | "guide" | "package" | "payment" | "template" | "capture" | "edit" | "result"

/** Perataan konten layar — full element (bukan hanya header). */
export type KioskPageAlign = "left" | "center" | "right"

/** Override per layar (opsional semua) — fallback ke nilai global kiosk. */
export type KioskPageConfig = {
  bg_color?: string
  text_color?: string
  font_scale?: number
  button_radius?: number
  padding?: number
  /** Perataan konten layar ini (menimpa global). */
  align?: KioskPageAlign
  /** Storage key bucket business-assets (URL di-sign saat render). */
  video_key?: string | null
  /** Signed URL video promo layar ini (diisi server saat render). */
  video_url?: string | null
}

/** Gaya visual kiosk turunan branding.kiosk — dipakai lintas screen. */
export type KioskVisualStyle = {
  bg: string
  text: string
  /** CSS font-family judul/label (dari font_family, default display). */
  fontFamily: string
  fontScale: number
  radius: number
  padding: number
  /** Perataan konten layar (page override ?? global) — undefined = default layar. */
  align?: KioskPageAlign
  /** Warna aksen brand (primary_color) — dipakai tombol CTA layar kiosk. */
  accent: string
  /** Warna teks/garis brand (secondary_color) — dipakai teks tombol CTA. */
  primary: string
}

export function kioskVisualStyle(
  k: KioskBrandingConfig | undefined,
  page?: KioskPageId,
  brand?: { primary?: string | null; secondary?: string | null }
): KioskVisualStyle {
  const accent = brand?.primary || defaultBrandColors.accent
  const ink = brand?.secondary || defaultBrandColors.ink
  const global: KioskVisualStyle = {
    bg: k?.bg_color || defaultBrandColors.bg,
    text: k?.text_color || defaultBrandColors.ink,
    fontFamily: KIOSK_FONT_FAMILIES[k?.font_family ?? "display"],
    fontScale: k?.font_scale ?? 1,
    radius: k?.button_radius ?? 0,
    padding: k?.padding ?? 24,
    align: k?.align,
    accent,
    primary: ink,
  }
  if (!page) return global
  const p = k?.pages?.[page]
  if (!p) return global
  return {
    bg: p.bg_color ?? global.bg,
    text: p.text_color ?? global.text,
    fontFamily: global.fontFamily,
    fontScale: p.font_scale ?? global.fontScale,
    radius: p.button_radius ?? global.radius,
    padding: p.padding ?? global.padding,
    align: p.align ?? global.align,
    accent: global.accent,
    primary: global.primary,
  }
}

export type BrandingConfig = {
  welcome_title?: string
  welcome_tagline?: string
  welcome_button?: string
  primary_color?: string
  secondary_color?: string
  /** Storage key bucket business-assets (URL di-sign saat render). */
  logo_key?: string | null
  logo_url?: string | null
  kiosk?: KioskBrandingConfig
}

export type CameraSettings = {
  countdown_seconds?: number
  mirror_preview?: boolean
  chroma_key_enabled?: boolean
  fullscreen?: boolean
  facingMode?: string | null
  preferred_device_id?: string | null
  capture_width?: number
  capture_height?: number
  jpeg_quality?: number
  /** Kalibrasi teknisi — rotasi default kamera (derajat, 0/90/180/270). */
  rotation_degrees?: number
  /** Kalibrasi teknisi — zoom default kamera (1 = tanpa zoom). */
  zoom?: number
  /** Orientasi layar kiosk per booth (landscape/portrait) — dikunci runtime. */
  screen_orientation?: "landscape" | "portrait"
}

export type PrintSettings = {
  enabled?: boolean
  paper_size?: "4x6" | "A6"
  layout?: "single" | "strip"
  orientation?: "portrait" | "landscape"
  auto_print?: boolean
  copies?: number
  margins_mm?: number
}

export type SessionSettings = {
  timer_seconds?: number
  warning_seconds?: number
  max_retakes?: number | null
}

export type PublicPackage = {
  id: string
  name: string
  price: number
  photo_count: number
  print_count: number
  digital_output: boolean
  capture_mode: "single" | "burst" | "photostrip"
  description?: string | null
}

export type PublicTemplate = {
  id: string
  name: string
  category: string
  /** Signed URL frame (bucket private) — null layout = template legacy. */
  file_url: string
  thumbnail_url?: string | null
  layout: TemplateLayout | null
  slot_count: number
}

export type PhotoboxConfig = {
  id: string
  slug: string
  name: string
  status: string
  camera_settings: CameraSettings
  print_settings: PrintSettings
  session_settings: SessionSettings
  device_status: Record<string, unknown> | null
}

export type PublicConfig = {
  business: { name: string; slug: string; logo_url: string | null }
  branding: BrandingConfig
  photobox: PhotoboxConfig
  packages: PublicPackage[]
  /** Mode offline kiosk (docs/05): sesi tanpa QRIS, transaksi offline non-withdrawable. */
  checkout: { offline_enabled: boolean }
  /** Hash konten config — dipakai ETag/If-None-Match (poll kiosk 304 anti boros). */
  etag: string
}

export type CapturePhoto = {
  /** Blob JPEG hasil capture (disimpan di state client sampai finalize).
   *  Data URL TIDAK disimpan — render pakai URL.createObjectURL(blob). */
  blob: Blob
}

/** Foto final yang dihasilkan editor (blob saja — render via object URL). */
export type FinalPhoto = {
  blob: Blob
}

export type EditorAdjust = {
  filter: string
  zoom: number
  panX: number
  panY: number
  rotation: number
  brightness: number
  contrast: number
  saturation: number
  blur: number
  grain: number
  vignette: number
}

/** Overlay teks/stiker (editor) — posisi normalized 0..1, size = fraksi tinggi foto. */
export type KioskOverlay = {
  id: string
  kind: "text" | "sticker"
  content: string
  color: string
  size: number
  x: number
  y: number
  rotation: number
}

/** Editan per foto yang dicapture. */
export type PhotoEdit = {
  adjust: EditorAdjust
  overlays: KioskOverlay[]
}

export const FILTER_PRESETS: { id: string; label: string; css: string }[] = [
  { id: "original", label: "Original", css: "none" },
  { id: "film", label: "Film", css: "contrast(1.05) saturate(0.85) brightness(1.02)" },
  { id: "warm", label: "Warm", css: "sepia(0.25) saturate(1.2)" },
  { id: "cool", label: "Cool", css: "hue-rotate(-10deg) saturate(1.1)" },
  { id: "bw", label: "B&W", css: "grayscale(1) contrast(1.1)" },
  { id: "retro", label: "Retro", css: "sepia(0.4) contrast(1.1) saturate(1.15)" },
  { id: "vintage", label: "Vintage", css: "sepia(0.5) brightness(0.95) contrast(0.95)" },
  { id: "y2k", label: "Y2K", css: "saturate(1.6) contrast(1.1) brightness(1.05)" },
]
