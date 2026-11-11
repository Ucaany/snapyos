export const SETTINGS_SCHEMA_VERSION = 1;

export const DEVICE_SETTING_GROUPS = [
  "camera_settings",
  "print_settings",
  "session_settings",
  "appearance_settings",
] as const;
export type DeviceSettingGroupName = (typeof DEVICE_SETTING_GROUPS)[number];

export const CLOUD_SYNCED_DEVICE_GROUPS = [
  "camera_settings",
  "print_settings",
  "session_settings",
] as const;
export const LOCAL_ONLY_DEVICE_GROUPS = ["appearance_settings"] as const;

export const CLOUD_OWNED_SETTING_FIELDS: Record<DeviceSettingGroupName, readonly string[]> = {
  camera_settings: [],
  print_settings: ["copies", "layout"],
  session_settings: [],
  appearance_settings: [],
};

export const DEVICE_SETTING_FIELDS: Record<DeviceSettingGroupName, readonly string[]> = {
  camera_settings: [
    "provider",
    "bridge_url",
    "countdown_seconds",
    "mirror_preview",
    "fullscreen",
    "facingMode",
    "preferred_device_id",
    "capture_width",
    "capture_height",
    "jpeg_quality",
    "rotation_degrees",
    "zoom",
    "screen_orientation",
  ],
  print_settings: [
    "enabled",
    "paper_size",
    "layout",
    "orientation",
    "auto_print",
    "copies",
    "margins_mm",
    "fit",
    "strip_2up",
    "media_name",
    "mode",
    "bluetooth_paper_width_mm",
    "bluetooth_device_name",
    "bridge_url",
    "printer_name",
    "photo",
    "thermal",
    "receipt",
  ],
  session_settings: ["timer_seconds", "warning_seconds", "max_retakes"],
  appearance_settings: [
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
  ],
};

/**
 * Field yang berisi objek bersarang di dalam grup, bukan nilai datar.
 * Digabung satu level (device menang per sub-key) supaya `photo.printer_name`
 * dari booth tidak menghapus `photo.paper_size` milik cloud.
 */
export const NESTED_SETTING_GROUPS: Partial<Record<DeviceSettingGroupName, readonly string[]>> = {
  print_settings: ["photo", "thermal", "receipt"],
};

/** Invarian lintas-field dari schema. Ditegakkan C# dan zod; jangan disalin manual. */
export type SettingInvariant = {
  left: string;
  op: "<" | "<=" | ">" | ">=" | "==" | "!=";
  right: string;
};
export const SETTING_INVARIANTS: Record<string, readonly SettingInvariant[]> = {
  sessionSettings: [{ left: "warning_seconds", op: "<", right: "timer_seconds" }],
};

export interface AppearancePage {
  bg_color?: string;
  text_color?: string;
  font_scale?: number;
  button_radius?: number;
  padding?: number;
  align?: "left" | "center" | "right";
}

export interface AppearancePages {
  welcome?: AppearancePage;
  guide?: AppearancePage;
  package?: AppearancePage;
  payment?: AppearancePage;
  template?: AppearancePage;
  capture?: AppearancePage;
  edit?: AppearancePage;
  result?: AppearancePage;
}

export interface CameraSettings {
  provider?: "browser" | "bridge" | "gphoto2" | "digicamcontrol" | "libcamera" | "v4l2" | "pyav";
  bridge_url?: string;
  countdown_seconds?: number;
  mirror_preview?: boolean;
  fullscreen?: boolean;
  facingMode?: "user" | "environment" | null;
  preferred_device_id?: string | null;
  capture_width?: number;
  capture_height?: number;
  jpeg_quality?: number;
  rotation_degrees?: number;
  zoom?: number;
  screen_orientation?: "landscape" | "portrait";
}

/** Printer foto (CUPS / dialog OS / Bluetooth): hasil foto, bukan struk POS. */
export interface PrintPhotoSettings {
  enabled?: boolean;
  mode?: "browser" | "bluetooth" | "cups";
  printer_name?: string;
  paper_size?: "4x6" | "2x6" | "5x7" | "6x8" | "A6";
  orientation?: "portrait" | "landscape" | "auto";
  fit?: "auto" | "contain" | "cover";
  margins_mm?: number;
  media_name?: string;
  strip_2up?: boolean;
  auto_print?: boolean;
  bridge_url?: string;
}

/** Foto 1-bit ke printer thermal (ESC/POS raster). */
export interface PrintThermalSettings {
  enabled?: boolean;
  paper_width_mm?: 58 | 80;
  printer_name?: string;
  bluetooth_device_name?: string;
  auto_print?: boolean;
}

/** Struk teks POS. */
export interface PrintReceiptSettings {
  enabled?: boolean;
  mode?: "browser" | "bluetooth" | "cups";
  paper_width_mm?: 58 | 80;
  printer_name?: string;
  auto_print?: boolean;
}

export interface PrintSettings {
  enabled?: boolean;
  paper_size?: "4x6" | "2x6" | "5x7" | "6x8" | "A6";
  layout?: "single" | "strip";
  orientation?: "portrait" | "landscape" | "auto";
  auto_print?: boolean;
  copies?: number;
  margins_mm?: number;
  fit?: "auto" | "contain" | "cover";
  strip_2up?: boolean;
  media_name?: string;
  mode?: "browser" | "bluetooth" | "cups";
  bluetooth_paper_width_mm?: number;
  bluetooth_device_name?: string;
  bridge_url?: string;
  printer_name?: string;
  photo?: PrintPhotoSettings;
  thermal?: PrintThermalSettings;
  receipt?: PrintReceiptSettings;
}

export interface SessionSettings {
  timer_seconds?: number;
  warning_seconds?: number;
  max_retakes?: number | null;
  kiosk_review_grid?: boolean;
}

export interface AppearanceSettings {
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
  guide_steps?: Array<string>;
  pages?: AppearancePages;
}

export interface DeviceSettings {
  camera_settings?: CameraSettings;
  print_settings?: PrintSettings;
  session_settings?: SessionSettings;
  appearance_settings?: AppearanceSettings;
}

/**
 * Salin field device di atas nilai cloud untuk satu grup setelan.
 *
 * Kunci cloud-owned (`copies`, `layout`) dilewati: booth tidak boleh menimpa
 * harga bahan atau bentuk produk. Field bersarang yang dikenal
 * (`NESTED_SETTING_GROUPS`) digabung satu level, jadi booth yang hanya
 * mengirim `photo.printer_name` tidak menghapus `photo.paper_size` milik cloud.
 */
export function mergeDeviceGroup(
  group: DeviceSettingGroupName,
  base: unknown,
  incoming: Record<string, unknown>,
  cloudOwned: readonly string[] = CLOUD_OWNED_SETTING_FIELDS[group]
): Record<string, unknown> {
  const source =
    base && typeof base === "object" && !Array.isArray(base)
      ? (base as Record<string, unknown>)
      : {};
  const merged: Record<string, unknown> = { ...source };
  const nestedKeys = NESTED_SETTING_GROUPS[group] ?? [];
  for (const [key, value] of Object.entries(incoming)) {
    if (value === undefined || cloudOwned.includes(key)) continue;
    if (nestedKeys.includes(key) && value && typeof value === "object" && !Array.isArray(value)) {
      const prior = merged[key];
      const nested: Record<string, unknown> =
        prior && typeof prior === "object" && !Array.isArray(prior)
          ? { ...(prior as Record<string, unknown>) }
          : {};
      for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
        if (childValue === undefined) continue;
        nested[childKey] = childValue;
      }
      merged[key] = nested;
      continue;
    }
    merged[key] = value;
  }
  return merged;
}
