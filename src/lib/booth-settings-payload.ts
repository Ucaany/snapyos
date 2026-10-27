/**
 * Bentuk payload setelan booth — dipisah dari komponen supaya bisa diuji.
 *
 * Aturan yang dijaga di sini (dan ditegakkan ulang server, bukan hanya UI):
 *
 * - Hanya grup milik booth yang dikirim: kamera, printer, sesi, tampilan.
 * - `print_settings.copies` dan `print_settings.layout` TIDAK PERNAH
 *   disertakan. Keduanya milik cloud (biaya bahan & bentuk produk); kalau
 *   ikut terkirim, runtime menjawab `403 FIELD_NOT_DEVICE_OWNED`.
 * - Harga, paket, payment gateway, logo, dan warna brand tidak punya
 *   representasi di sini — semuanya diatur di website.
 *
 * Modul ini murni (tanpa React, tanpa `@/`) agar bisa diuji langsung.
 */

import type { AppearanceSettings } from "./appearance-merge.ts";

export type BoothCameraDraft = {
  provider: "browser" | "gphoto2";
  countdown_seconds: number;
  capture_width: number;
  capture_height: number;
  mirror_preview: boolean;
  screen_orientation: "landscape" | "portrait";
  /** Booth punya layar hijau — editor kiosk menawarkan hapus latar. */
  chroma_key_enabled: boolean;
};

export type BoothPrintDraft = {
  enabled: boolean;
  mode: "browser" | "bluetooth" | "cups";
  paper_size: "4x6" | "A6";
  orientation: "portrait" | "landscape";
  auto_print: boolean;
  margins_mm: number;
  printer_name: string;
};

export type BoothSessionDraft = {
  timer_seconds: number;
  warning_seconds: number;
  max_retakes: number | null;
};

export type BoothAppearanceDraft = {
  bg_color: string;
  text_color: string;
  font_scale: number;
  button_radius: number;
  padding: number;
  welcome_title: string;
  welcome_tagline: string;
  guide_steps: string;
};

export type BoothDraft = {
  camera: BoothCameraDraft;
  print: BoothPrintDraft;
  session: BoothSessionDraft;
  appearance: BoothAppearanceDraft;
};

/** Setelan booth yang siap dikirim ke `PUT /v1/settings`. */
export type BoothSettingsPayload = {
  camera_settings: Record<string, unknown>;
  print_settings: Record<string, unknown>;
  session_settings: Record<string, unknown>;
  appearance_settings: Record<string, unknown>;
};

/**
 * Draft form → payload `PUT /v1/settings`.
 *
 * `copies` dan `layout` sengaja tidak ada di tipe draft, jadi tidak mungkin
 * ikut terkirim. Itu bukan kelalaian: keduanya milik cloud.
 */
export function boothDraftToSettings(draft: BoothDraft): BoothSettingsPayload {
  const guideSteps = draft.appearance.guide_steps
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8);

  const appearance: AppearanceSettings = {
    bg_color: draft.appearance.bg_color,
    text_color: draft.appearance.text_color,
    font_scale: draft.appearance.font_scale,
    button_radius: draft.appearance.button_radius,
    padding: draft.appearance.padding,
  };
  if (draft.appearance.welcome_title.trim()) {
    appearance.welcome_title = draft.appearance.welcome_title.trim();
  }
  if (draft.appearance.welcome_tagline.trim()) {
    appearance.welcome_tagline = draft.appearance.welcome_tagline.trim();
  }
  if (guideSteps.length > 0) appearance.guide_steps = guideSteps;

  return {
    camera_settings: {
      provider: draft.camera.provider,
      countdown_seconds: draft.camera.countdown_seconds,
      capture_width: draft.camera.capture_width,
      capture_height: draft.camera.capture_height,
      mirror_preview: draft.camera.mirror_preview,
      screen_orientation: draft.camera.screen_orientation,
      chroma_key_enabled: draft.camera.chroma_key_enabled,
    },
    print_settings: {
      enabled: draft.print.enabled,
      mode: draft.print.mode,
      paper_size: draft.print.paper_size,
      orientation: draft.print.orientation,
      auto_print: draft.print.auto_print,
      margins_mm: draft.print.margins_mm,
      ...(draft.print.printer_name.trim() ? { printer_name: draft.print.printer_name.trim() } : {}),
    },
    session_settings: {
      timer_seconds: draft.session.timer_seconds,
      warning_seconds: draft.session.warning_seconds,
      max_retakes: draft.session.max_retakes,
    },
    appearance_settings: appearance as Record<string, unknown>,
  };
}
