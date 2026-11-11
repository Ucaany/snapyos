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
import type {
  PrintPhotoSettings,
  PrintReceiptSettings,
  PrintThermalSettings,
} from "./device-settings-contract.ts";

export type BoothCameraDraft = {
  /** bridge = kamera fisik lewat runtime lokal (gphoto2 / libcamera / v4l2 / PyAV). */
  provider: "browser" | "bridge";
  countdown_seconds: number;
  capture_width: number;
  capture_height: number;
  mirror_preview: boolean;
  screen_orientation: "landscape" | "portrait";
  /** Device kamera pilihan operator (`enumerateDevices()` / bridge). */
  preferred_device_id?: string | null;
};

export type BoothPrintDraft = {
  enabled: boolean;
  mode: "browser" | "bluetooth" | "cups";
  paper_size: "4x6" | "2x6" | "5x7" | "6x8" | "A6";
  orientation: "portrait" | "landscape" | "auto";
  fit?: "auto" | "contain" | "cover";
  strip_2up?: boolean;
  media_name?: string;
  auto_print: boolean;
  margins_mm: number;
  printer_name: string;
  /** Lebar kertas thermal 58/80 mm (default 80 bila kosong). */
  bluetooth_paper_width_mm?: 58 | 80;
  /** Nama printer Bluetooth terakhir yang berhasil tersambung. */
  bluetooth_device_name?: string;
  /** URL bridge lokal untuk CUPS (kosong = 127.0.0.1:17777). */
  bridge_url?: string;
  /** Jalur cetak foto (printer foto). */
  photo?: PrintPhotoSettings;
  /** Foto 1-bit ke printer thermal. */
  thermal?: PrintThermalSettings;
  /** Struk POS. */
  receipt?: PrintReceiptSettings;
};

export type BoothSessionDraft = {
  timer_seconds: number;
  warning_seconds: number;
  max_retakes: number | null;
  /** Layar review grid setelah capture (default ON). */
  kiosk_review_grid?: boolean;
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
 * Salin nilai datar panel ke grup `photo` yang sudah ada.
 *
 * Resolusi jalur cetak memakai grup bersarang lebih dulu
 * (`resolvePurposeSettings`), jadi nilai datar yang diubah operator harus ikut
 * masuk ke grup. Hanya kunci yang sudah ada di grup yang ditimpa: kunci yang
 * tidak ada sudah jatuh ke nilai datar lewat `??`, dan menambah kunci baru
 * berarti mengarang grup.
 */
function mirrorPhotoGroup(photo: PrintPhotoSettings, print: BoothPrintDraft): PrintPhotoSettings {
  const next: PrintPhotoSettings = { ...photo };
  if (photo.mode != null && photo.mode !== print.mode) next.mode = print.mode;
  if (photo.paper_size != null && photo.paper_size !== print.paper_size) {
    next.paper_size = print.paper_size;
  }
  if (photo.orientation != null && photo.orientation !== print.orientation) {
    next.orientation = print.orientation;
  }
  if (photo.fit != null && print.fit !== undefined && photo.fit !== print.fit) next.fit = print.fit;
  if (
    photo.strip_2up != null &&
    print.strip_2up !== undefined &&
    photo.strip_2up !== print.strip_2up
  ) {
    next.strip_2up = print.strip_2up;
  }
  if (photo.margins_mm != null && photo.margins_mm !== print.margins_mm) {
    next.margins_mm = print.margins_mm;
  }
  if (photo.auto_print != null && photo.auto_print !== print.auto_print) {
    next.auto_print = print.auto_print;
  }
  if (
    photo.printer_name != null &&
    print.printer_name &&
    photo.printer_name !== print.printer_name
  ) {
    next.printer_name = print.printer_name;
  }
  const bridgeUrl = print.bridge_url?.trim();
  if (photo.bridge_url != null && bridgeUrl && photo.bridge_url !== bridgeUrl) {
    next.bridge_url = bridgeUrl;
  }
  return next;
}

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

  const preferredDeviceId = draft.camera.preferred_device_id?.trim();

  return {
    camera_settings: {
      provider: draft.camera.provider,
      countdown_seconds: draft.camera.countdown_seconds,
      capture_width: draft.camera.capture_width,
      capture_height: draft.camera.capture_height,
      mirror_preview: draft.camera.mirror_preview,
      screen_orientation: draft.camera.screen_orientation,
      ...(preferredDeviceId ? { preferred_device_id: preferredDeviceId } : {}),
    },
    print_settings: {
      enabled: draft.print.enabled,
      mode: draft.print.mode,
      paper_size: draft.print.paper_size,
      orientation: draft.print.orientation,
      fit: draft.print.fit,
      strip_2up: draft.print.strip_2up,
      auto_print: draft.print.auto_print,
      margins_mm: draft.print.margins_mm,
      ...(draft.print.media_name?.trim() ? { media_name: draft.print.media_name.trim() } : {}),
      ...(draft.print.printer_name.trim() ? { printer_name: draft.print.printer_name.trim() } : {}),
      ...(draft.print.bluetooth_paper_width_mm
        ? { bluetooth_paper_width_mm: draft.print.bluetooth_paper_width_mm }
        : {}),
      ...(draft.print.bluetooth_device_name?.trim()
        ? { bluetooth_device_name: draft.print.bluetooth_device_name.trim() }
        : {}),
      ...(draft.print.bridge_url?.trim() ? { bridge_url: draft.print.bridge_url.trim() } : {}),
      ...(draft.print.photo ? { photo: mirrorPhotoGroup(draft.print.photo, draft.print) } : {}),
      ...(draft.print.thermal ? { thermal: draft.print.thermal } : {}),
      ...(draft.print.receipt ? { receipt: draft.print.receipt } : {}),
    },
    session_settings: {
      timer_seconds: draft.session.timer_seconds,
      warning_seconds: draft.session.warning_seconds,
      max_retakes: draft.session.max_retakes,
      ...(draft.session.kiosk_review_grid === undefined
        ? {}
        : { kiosk_review_grid: draft.session.kiosk_review_grid }),
    },
    appearance_settings: appearance as Record<string, unknown>,
  };
}
