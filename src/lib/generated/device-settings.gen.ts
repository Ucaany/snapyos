// AUTO-GENERATED — jangan diubah manual.
// Sumber: booth/contracts/device-settings.schema.json
// Regenerate: node booth/contracts/generate.mjs

export const SETTINGS_SCHEMA_VERSION = 1;

export const DEVICE_SETTING_GROUPS = ["camera_settings", "print_settings", "session_settings", "appearance_settings"] as const;
export type DeviceSettingGroupName = (typeof DEVICE_SETTING_GROUPS)[number];

export const CLOUD_SYNCED_DEVICE_GROUPS = ["camera_settings", "print_settings", "session_settings"] as const;
export const LOCAL_ONLY_DEVICE_GROUPS = ["appearance_settings"] as const;

export const CLOUD_OWNED_SETTING_FIELDS: Record<DeviceSettingGroupName, readonly string[]> = {
  camera_settings: [],
  print_settings: ["copies", "layout"],
  session_settings: [],
  appearance_settings: [],
};

export const DEVICE_SETTING_FIELDS: Record<DeviceSettingGroupName, readonly string[]> = {
  camera_settings: ["provider", "bridge_url", "countdown_seconds", "mirror_preview", "chroma_key_enabled", "fullscreen", "facingMode", "preferred_device_id", "capture_width", "capture_height", "jpeg_quality", "rotation_degrees", "zoom", "screen_orientation"],
  print_settings: ["enabled", "paper_size", "layout", "orientation", "auto_print", "copies", "margins_mm", "mode", "bluetooth_paper_width_mm", "bluetooth_device_name", "bridge_url", "printer_name"],
  session_settings: ["timer_seconds", "warning_seconds", "max_retakes"],
  appearance_settings: ["bg_color", "text_color", "font_family", "font_scale", "button_radius", "padding", "align", "welcome_layout", "result_layout", "welcome_title", "welcome_tagline", "welcome_button", "payment_title", "payment_hint", "capture_title", "capture_hint", "editor_title", "editor_hint", "result_title", "result_hint", "guide_title", "guide_button", "package_title", "template_title", "show_logo", "show_tagline", "show_mirror_toggle", "allow_zoom_pan", "guide_steps", "pages"],
};

/** Invarian lintas-field dari schema. Ditegakkan C# dan zod; jangan disalin manual. */
export type SettingInvariant = { left: string; op: "<" | "<=" | ">" | ">=" | "==" | "!="; right: string };
export const SETTING_INVARIANTS: Record<string, readonly SettingInvariant[]> = {
  "sessionSettings": [{ left: "warning_seconds", op: "<", right: "timer_seconds" }],
};

export interface AppearancePage {
  "bg_color"?: string;
  "text_color"?: string;
  "font_scale"?: number;
  "button_radius"?: number;
  "padding"?: number;
  "align"?: "left" | "center" | "right";
}

export interface AppearancePages {
  "welcome"?: AppearancePage;
  "guide"?: AppearancePage;
  "package"?: AppearancePage;
  "payment"?: AppearancePage;
  "template"?: AppearancePage;
  "capture"?: AppearancePage;
  "edit"?: AppearancePage;
  "result"?: AppearancePage;
}

export interface CameraSettings {
  "provider"?: "browser" | "bridge" | "gphoto2" | "digicamcontrol" | "libcamera" | "v4l2" | "pyav";
  "bridge_url"?: string;
  "countdown_seconds"?: number;
  "mirror_preview"?: boolean;
  "chroma_key_enabled"?: boolean;
  "fullscreen"?: boolean;
  "facingMode"?: "user" | "environment" | null;
  "preferred_device_id"?: string | null;
  "capture_width"?: number;
  "capture_height"?: number;
  "jpeg_quality"?: number;
  "rotation_degrees"?: number;
  "zoom"?: number;
  "screen_orientation"?: "landscape" | "portrait";
}

export interface PrintSettings {
  "enabled"?: boolean;
  "paper_size"?: "4x6" | "A6";
  "layout"?: "single" | "strip";
  "orientation"?: "portrait" | "landscape";
  "auto_print"?: boolean;
  "copies"?: number;
  "margins_mm"?: number;
  "mode"?: "browser" | "bluetooth" | "cups";
  "bluetooth_paper_width_mm"?: number;
  "bluetooth_device_name"?: string;
  "bridge_url"?: string;
  "printer_name"?: string;
}

export interface SessionSettings {
  "timer_seconds"?: number;
  "warning_seconds"?: number;
  "max_retakes"?: number | null;
}

export interface AppearanceSettings {
  "bg_color"?: string;
  "text_color"?: string;
  "font_family"?: "display" | "sans" | "mono";
  "font_scale"?: number;
  "button_radius"?: number;
  "padding"?: number;
  "align"?: "left" | "center" | "right";
  "welcome_layout"?: "split-left" | "split-right" | "center";
  "result_layout"?: "qr-right" | "qr-left" | "qr-below";
  "welcome_title"?: string;
  "welcome_tagline"?: string;
  "welcome_button"?: string;
  "payment_title"?: string;
  "payment_hint"?: string;
  "capture_title"?: string;
  "capture_hint"?: string;
  "editor_title"?: string;
  "editor_hint"?: string;
  "result_title"?: string;
  "result_hint"?: string;
  "guide_title"?: string;
  "guide_button"?: string;
  "package_title"?: string;
  "template_title"?: string;
  "show_logo"?: boolean;
  "show_tagline"?: boolean;
  "show_mirror_toggle"?: boolean;
  "allow_zoom_pan"?: boolean;
  "guide_steps"?: Array<string>;
  "pages"?: AppearancePages;
}

export interface DeviceSettings {
  "camera_settings"?: CameraSettings;
  "print_settings"?: PrintSettings;
  "session_settings"?: SessionSettings;
  "appearance_settings"?: AppearanceSettings;
}
