/**
 * Zod schema server-side — semua input divalidasi di server (docs/03 §3.1).
 * Endpoint schema contract: docs/08 §8.19.
 */

import { z } from "zod";
import { layoutSchema } from "./template-layout.ts";
import { MAX_RANGE_DAYS, rangeDays } from "./dashboard-math.ts";
import { RETENTION_MAX_DAYS, RETENTION_MIN_DAYS } from "./retention.ts";
import {
  CLOUD_OWNED_SETTING_FIELDS,
  CLOUD_SYNCED_DEVICE_GROUPS,
  DEVICE_SETTING_FIELDS,
  DEVICE_SETTING_GROUPS,
  LOCAL_ONLY_DEVICE_GROUPS,
  SETTING_INVARIANTS,
} from "./device-settings-contract.ts";

/** UUID PostgreSQL canonical: shape hex, tanpa pembatasan version/variant RFC. */
const uuid = z.string().guid();

// ---------------------------------------------------------------------------
// Payment provider constants (Phase 1 — dipakai registry, adapter, validators).
// Schema CRUD credential ada di Phase 2; cukup konstanta di sini.
// ---------------------------------------------------------------------------

export const PAYMENT_PROVIDER_CODES = ["midtrans", "tripay", "pakasir"] as const;
export const PAYMENT_ENVIRONMENTS = ["sandbox", "production"] as const;

const paymentMethodCodes = z.array(z.string().trim().min(1).max(40)).max(12);
const paymentCredentialBaseSchema = z.object({
  provider: z.enum(PAYMENT_PROVIDER_CODES),
  label: z.string().trim().min(1).max(80).nullable().optional(),
  merchant_id: z.string().trim().min(1, "Merchant ID wajib diisi").max(160),
  client_key: z.string().trim().max(500).nullable().optional(),
  environment: z.enum(PAYMENT_ENVIRONMENTS),
  is_active: z.boolean().optional(),
  enabled_methods: paymentMethodCodes.optional(),
  private_key: z.string().trim().min(1).max(4000).optional(),
  webhook_secret: z.string().trim().min(1).max(4000).optional(),
});

export const paymentCredentialCreateSchema = paymentCredentialBaseSchema
  .extend({ server_key: z.string().trim().min(1, "Server key wajib diisi").max(4000) })
  .superRefine((value, ctx) => {
    if (value.provider === "tripay" && !value.private_key) {
      ctx.addIssue({
        code: "custom",
        path: ["private_key"],
        message: "Private key Tripay wajib diisi",
      });
    }
    if (value.provider === "pakasir" && !value.webhook_secret) {
      ctx.addIssue({
        code: "custom",
        path: ["webhook_secret"],
        message: "Webhook secret Pakasir wajib diisi",
      });
    }
  });

export const paymentCredentialUpdateSchema = paymentCredentialBaseSchema
  .extend({ server_key: z.string().trim().min(1).max(4000).optional() })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: "Minimal satu field diubah" });

export type PaymentCredentialCreateInput = z.infer<typeof paymentCredentialCreateSchema>;
export type PaymentCredentialUpdateInput = z.infer<typeof paymentCredentialUpdateSchema>;

/**
 * Sumber akuisisi saat registrasi — enum di app layer (bukan DB constraint)
 * agar mudah ditambah tanpa migration (docs/10 §10.2 konteks admin).
 */
export const ACQUISITION_SOURCES = [
  "search_engine",
  "social_media",
  "recommendation",
  "event",
  "advertisement",
  "other",
] as const;

export const ACQUISITION_SOURCE_LABELS: Record<(typeof ACQUISITION_SOURCES)[number], string> = {
  search_engine: "Mesin pencari (Google, dll.)",
  social_media: "Media sosial (Instagram, TikTok, dll.)",
  recommendation: "Rekomendasi teman / keluarga",
  event: "Event / pameran",
  advertisement: "Iklan berbayar",
  other: "Lainnya",
};

/**
 * Normalisasi nomor WhatsApp Indonesia ke format +62 (E.164 bebas display).
 * Input sudah tervalidasi registerSchema; pure & unit-testable.
 */
export function normalizeWhatsapp(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith("+62")) return trimmed;
  if (trimmed.startsWith("62")) return `+${trimmed}`;
  return `+62${trimmed.replace(/^0/, "")}`;
}

// Field baru .optional() demi back-compat API lama ({name,email,password});
// enforcement kewajiban ada di form UI, bukan schema.
export const registerSchema = z.object({
  name: z.string().trim().min(1, "Nama wajib diisi").max(80, "Nama maksimal 80 karakter"),
  email: z.string().trim().toLowerCase().email("Format email tidak valid").max(254),
  password: z
    .string()
    .min(8, "Password minimal 8 karakter")
    .max(72, "Password maksimal 72 karakter"),
  whatsapp: z
    .string()
    .trim()
    .regex(/^(\+?62|0)8[0-9]{7,13}$/, "Nomor WhatsApp Indonesia tidak valid")
    .optional(),
  acquisition_source: z.enum(ACQUISITION_SOURCES).optional(),
  planned_devices: z.number().int().min(0).max(1000).optional().nullable(),
});

export const loginSchema = z
  .object({
    email: z.string().trim().toLowerCase().email("Format email tidak valid"),
    password: z.string().min(1, "Password wajib diisi").optional(),
    // Staff login: PIN 4–6 digit (password kosong untuk jalur ini). Booth tidak
    // dipilih pra-sesi: PIN diverifikasi terhadap assignment milik email.
    pin: z
      .string()
      .trim()
      .regex(/^\d{4,6}$/, "PIN 4–6 digit")
      .optional(),
  })
  // Form memakai `noValidate`, jadi submit kosong tetap sampai ke server.
  // Tanpa refine ini, payload tanpa password DAN pin lolos validasi lalu
  // membakar satu verifikasi argon2 sekaligus menambah counter lockout.
  // Error di level root (tanpa path): field password tidak dirender di mode
  // PIN, jadi pesan harus tampil sebagai error form, bukan error field.
  .refine((v) => Boolean(v.password) !== Boolean(v.pin), {
    message: "Isi password atau PIN",
  });

export const staffPinSchema = z.object({
  user_id: uuid,
  photobox_id: uuid,
  // Kosong = hapus PIN (set null); non-kosong wajib 4–6 digit.
  pin: z
    .string()
    .trim()
    .refine((v) => v === "" || /^\d{4,6}$/.test(v), "PIN 4–6 digit"),
});

export const businessCreateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Nama bisnis minimal 2 karakter")
    .max(80, "Nama bisnis maksimal 80 karakter"),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Slug minimal 3 karakter")
    .max(48, "Slug maksimal 48 karakter")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug hanya boleh huruf kecil, angka, dan tanda hubung")
    .optional(),
});

export const businessUpdateSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  logo_url: z.string().url().max(500).nullable().optional(),
  timezone: z.string().trim().min(3).max(64).optional(),
  // Profil bisnis (0053) — diedit owner dari /dashboard/settings.
  whatsapp: z
    .string()
    .trim()
    .regex(/^(\+?62|0)8[0-9]{7,13}$/, "Nomor WhatsApp Indonesia tidak valid")
    .optional(),
  owner_name: z.string().trim().min(2, "Nama pemilik minimal 2 karakter").max(80).optional(),
  contact_email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Format email tidak valid")
    .max(254)
    .nullable()
    .optional(),
  address: z.string().trim().max(300).nullable().optional(),
});

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Warna harus hex #RRGGBB");

function contrastRatio(foreground: string, background: string): number {
  const luminance = (hex: string) => {
    const channels = [0, 2, 4].map(
      (offset) => Number.parseInt(hex.slice(offset + 1, offset + 3), 16) / 255
    );
    const linear = channels.map((channel) =>
      channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    );
    return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
  };
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Layout per layar kiosk — posisi/penempatan elemen (Branding & Kiosk). */
export const WELCOME_LAYOUTS = ["split-left", "split-right", "center"] as const;
export const PAYMENT_ALIGNS = ["left", "center"] as const;
export const RESULT_LAYOUTS = ["qr-right", "qr-left", "qr-below"] as const;
/** Perataan konten layar — kiri / tengah / kanan (full element). */
export const PAGE_ALIGNS = ["left", "center", "right"] as const;

/** Id layar kiosk yang sah — allowlist (anti injeksi key storage, lihat uploadKioskPageVideo). */
export const KIOSK_PAGE_IDS = [
  "welcome",
  "guide",
  "package",
  "payment",
  "template",
  "capture",
  "edit",
  "result",
] as const;

/** Id layar kiosk — hanya allowlist (dipakai upload per-layar agar `page` aman jadi segmen key R2). */
export const kioskPageIdSchema = z.enum(KIOSK_PAGE_IDS);

/** Override visual per layar kiosk (semua opsional — fallback ke global). */
const kioskPageSchema = z.object({
  bg_color: hexColor.optional(),
  text_color: hexColor.optional(),
  font_scale: z.number().min(0.8).max(1.4).optional(),
  button_radius: z.number().int().min(0).max(24).optional(),
  padding: z.number().int().min(0).max(96).optional(),
  /** Perataan konten layar ini (menimpa global). */
  align: z.enum(PAGE_ALIGNS).optional(),
  /** Storage key video promo layar ini (bucket business-assets). */
  video_key: z.string().trim().max(300).nullable().optional(),
});

/** Kiosk customization jsonb — Branding & Kiosk page (single source of truth kiosk). */
export const kioskBrandingSchema = z.object({
  bg_color: hexColor.optional(),
  text_color: hexColor.optional(),
  /** Font family judul/label kiosk (default display). */
  font_family: z.enum(["display", "sans", "mono"]).optional(),
  /** Skala tipografi kiosk (1 = default). */
  font_scale: z.number().min(0.8).max(1.4).optional(),
  /** Radius tombol kiosk (px 0–24; 0 = brutalist koten). */
  button_radius: z.number().int().min(0).max(24).optional(),
  /** Padding layar kiosk (px 0–96). */
  padding: z.number().int().min(0).max(96).optional(),
  /** Layout welcome: brand kiri / brand kanan / satu kolom center. */
  welcome_layout: z.enum(WELCOME_LAYOUTS).optional(),
  /** Alignment header payment screen. */
  payment_align: z.enum(PAYMENT_ALIGNS).optional(),
  /** Layout result: QR kanan (default) / kiri / bawah. */
  result_layout: z.enum(RESULT_LAYOUTS).optional(),
  payment_title: z.string().trim().max(80).optional(),
  payment_hint: z.string().trim().max(160).optional(),
  capture_title: z.string().trim().max(80).optional(),
  capture_hint: z.string().trim().max(160).optional(),
  editor_title: z.string().trim().max(80).optional(),
  editor_hint: z.string().trim().max(160).optional(),
  result_title: z.string().trim().max(80).optional(),
  result_hint: z.string().trim().max(160).optional(),
  guide_title: z.string().trim().max(80).optional(),
  guide_button: z.string().trim().min(1).max(24).optional(),
  package_title: z.string().trim().max(80).optional(),
  template_title: z.string().trim().max(80).optional(),
  show_logo: z.boolean().optional(),
  show_tagline: z.boolean().optional(),
  /** Perataan konten semua layar (kiri/tengah/kanan) — bisa ditimpa per layar. */
  align: z.enum(PAGE_ALIGNS).optional(),
  /** Override visual per layar — menimpa nilai global kiosk. */
  pages: z
    .object({
      welcome: kioskPageSchema.optional(),
      guide: kioskPageSchema.optional(),
      package: kioskPageSchema.optional(),
      payment: kioskPageSchema.optional(),
      template: kioskPageSchema.optional(),
      capture: kioskPageSchema.optional(),
      edit: kioskPageSchema.optional(),
      result: kioskPageSchema.optional(),
    })
    .optional(),
  /** Tutorial customer setelah welcome, sebelum memilih package/pembayaran. */
  guide_steps: z.array(z.string().trim().min(1).max(160)).max(8).optional(),
  /** Storage key bucket business-assets (URL di-sign saat render). */
  video_key: z.string().trim().max(300).nullable().optional(),
  /** Tampilkan tombol mirror di layar kamera customer (default true). */
  show_mirror_toggle: z.boolean().optional(),
  /** Izinkan customer zoom/pan foto di editor (default true). */
  allow_zoom_pan: z.boolean().optional(),
});

/** Branding jsonb — docs/04 §4.8 (Photobox Builder / branding + welcome). */
export const brandingSchema = z.object({
  welcome_title: z.string().trim().max(120).optional(),
  welcome_tagline: z.string().trim().max(200).optional(),
  welcome_button: z.string().trim().min(1).max(24).optional(),
  primary_color: hexColor.optional(),
  secondary_color: hexColor.optional(),
  /** Storage key di bucket business-assets (bukan URL — URL di-sign saat render). */
  logo_key: z.string().trim().max(300).nullable().optional(),
  kiosk: kioskBrandingSchema.optional(),
});

/**
 * Cek kontras tulis (WCAG AA 4.5:1) untuk branding: global kiosk + tiap override
 * per-layar. Dipakai pada jalur TULIS saja (bukan baca) supaya data lama yang
 * kontrasnya rendah tidak membuat seluruh branding gagal di-parse.
 * Mengembalikan daftar issue `{ path, message }` siap dipetakan ke fieldErrors.
 */
export function brandingContrastIssues(input: {
  kiosk?: {
    bg_color?: string;
    text_color?: string;
    pages?: Record<string, { bg_color?: string; text_color?: string } | undefined>;
  };
}): { path: string[]; message: string }[] {
  const issues: { path: string[]; message: string }[] = [];
  const check = (bg?: string, text?: string, path: string[] = ["kiosk", "text_color"]) => {
    if (bg && text && contrastRatio(text, bg) < 4.5) {
      issues.push({ path, message: "Kontras warna teks dan background minimal 4.5:1" });
    }
  };
  const k = input.kiosk;
  if (!k) return issues;
  check(k.bg_color, k.text_color);
  for (const [page, cfg] of Object.entries(k.pages ?? {})) {
    if (!cfg) continue;
    check(cfg.bg_color ?? k.bg_color, cfg.text_color ?? k.text_color, [
      "kiosk",
      "pages",
      page,
      "text_color",
    ]);
  }
  return issues;
}

/** Checkout settings jsonb — expiry QRIS owner-configurable (default 3 menit, docs/06 §6.3). */
export const checkoutSettingsSchema = z.object({
  qris_expiry_minutes: z.number().int().min(1).max(60).optional(),
  /** Mode offline kiosk (docs/05): sesi tanpa QRIS, transaksi offline non-withdrawable. */
  offline_enabled: z.boolean().optional(),
});

export const businessSettingsUpdateSchema = z.object({
  branding: brandingSchema.optional(),
  /** Retensi hasil foto 1–3 hari (kebijakan privasi ketat). */
  retention_days: z.number().int().min(RETENTION_MIN_DAYS).max(RETENTION_MAX_DAYS).optional(),
  checkout: checkoutSettingsSchema.optional(),
});

const photoboxStatus = z.enum(["online", "offline", "maintenance"]);
const photoboxPaymentMode = z.enum(["gateway", "voucher"]);

export const cameraSettingsSchema = z.object({
  provider: z
    .enum(["browser", "bridge", "gphoto2", "digicamcontrol", "libcamera", "v4l2", "pyav"])
    .optional(),
  bridge_url: z.string().trim().url().max(300).optional(),
  countdown_seconds: z.number().int().min(1).max(10).optional(),
  mirror_preview: z.boolean().optional(),
  chroma_key_enabled: z.boolean().optional(),
  fullscreen: z.boolean().optional(),
  facingMode: z.enum(["user", "environment"]).nullable().optional(),
  preferred_device_id: z.string().trim().max(200).nullable().optional(),
  capture_width: z.number().int().min(640).max(7680).optional(),
  capture_height: z.number().int().min(480).max(4320).optional(),
  jpeg_quality: z.number().min(0.5).max(1).optional(),
  rotation_degrees: z.number().int().min(0).max(270).optional(),
  zoom: z.number().min(1).max(5).optional(),
  screen_orientation: z.enum(["landscape", "portrait"]).optional(),
});

export const printSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  paper_size: z.enum(["4x6", "A6"]).optional(),
  layout: z.enum(["single", "strip"]).optional(),
  orientation: z.enum(["portrait", "landscape"]).optional(),
  auto_print: z.boolean().optional(),
  copies: z.number().int().min(1).max(20).optional(),
  margins_mm: z.number().int().min(0).max(20).optional(),
  /** Jalur cetak: dialog OS (browser) atau thermal ESC/POS lewat Web Bluetooth. */
  mode: z.enum(["browser", "bluetooth", "cups"]).optional(),
  /** Lebar kertas thermal 58/80 mm. */
  bluetooth_paper_width_mm: z.union([z.literal(58), z.literal(80)]).optional(),
  /** Nama printer Bluetooth (informasi petugas, bukan kredensial). */
  bluetooth_device_name: z.string().trim().max(60).optional(),
  bridge_url: z.string().trim().url().max(300).optional(),
  printer_name: z.string().trim().max(128).optional(),
});

/**
 * Terapkan invarian lintas-field yang dideklarasikan di schema
 * (`x-snapyos-invariants` → `SETTING_INVARIANTS`). Aturannya tidak ditulis di
 * sini: C# memakai daftar yang sama lewat `DeviceSettings.g.cs`.
 */
function withInvariants<T extends z.ZodTypeAny>(definition: string, schema: T): T {
  return schema.superRefine((value, ctx) => {
    for (const rule of SETTING_INVARIANTS[definition] ?? []) {
      const record = value as Record<string, unknown>;
      const left = record[rule.left];
      const right = record[rule.right];
      if (typeof left !== "number" || typeof right !== "number") {
        continue;
      }
      const holds = {
        "<": left < right,
        "<=": left <= right,
        ">": left > right,
        ">=": left >= right,
        "==": left === right,
        "!=": left !== right,
      }[rule.op];
      if (!holds) {
        ctx.addIssue({
          code: "custom",
          path: [rule.left],
          message: `${rule.left} harus ${rule.op} ${rule.right}`,
        });
      }
    }
  }) as unknown as T;
}

export const sessionSettingsSchema = withInvariants(
  "sessionSettings",
  z.object({
    timer_seconds: z.number().int().min(60).max(3600).optional(),
    warning_seconds: z.number().int().min(10).max(600).optional(),
    max_retakes: z.number().int().min(0).max(50).nullable().optional(),
  })
);

/**
 * Kustomisasi tampilan booth — milik DEVICE, bukan cloud.
 *
 * Booth punya layar, ukuran, dan sudut pandang sendiri; teks dan warna yang
 * terbaca di satu booth belum tentu terbaca di booth lain. Karena itu
 * kustomisasi disimpan di mesin booth (`PUT /v1/settings`) dan menang atas
 * `business_settings.branding` milik cloud.
 *
 * Yang tetap milik cloud: identitas brand (nama bisnis, logo, warna brand
 * primary/secondary), aset video (storage key), harga, paket, dan payment
 * gateway. Semua itu "informasi" yang harus sama di seluruh booth.
 *
 * `video_key` sengaja TIDAK ada di sini: video adalah objek storage milik
 * cloud, bukan nilai yang bisa dikarang mesin.
 */
const appearancePageSchema = z.object({
  bg_color: hexColor.optional(),
  text_color: hexColor.optional(),
  font_scale: z.number().min(0.8).max(1.4).optional(),
  button_radius: z.number().int().min(0).max(24).optional(),
  padding: z.number().int().min(0).max(96).optional(),
  align: z.enum(PAGE_ALIGNS).optional(),
});

export const appearanceSettingsSchema = z.object({
  bg_color: hexColor.optional(),
  text_color: hexColor.optional(),
  font_family: z.enum(["display", "sans", "mono"]).optional(),
  font_scale: z.number().min(0.8).max(1.4).optional(),
  button_radius: z.number().int().min(0).max(24).optional(),
  padding: z.number().int().min(0).max(96).optional(),
  align: z.enum(PAGE_ALIGNS).optional(),
  welcome_layout: z.enum(WELCOME_LAYOUTS).optional(),
  result_layout: z.enum(RESULT_LAYOUTS).optional(),
  welcome_title: z.string().trim().max(120).optional(),
  welcome_tagline: z.string().trim().max(200).optional(),
  welcome_button: z.string().trim().min(1).max(24).optional(),
  payment_title: z.string().trim().max(80).optional(),
  payment_hint: z.string().trim().max(160).optional(),
  capture_title: z.string().trim().max(80).optional(),
  capture_hint: z.string().trim().max(160).optional(),
  editor_title: z.string().trim().max(80).optional(),
  editor_hint: z.string().trim().max(160).optional(),
  result_title: z.string().trim().max(80).optional(),
  result_hint: z.string().trim().max(160).optional(),
  guide_title: z.string().trim().max(80).optional(),
  guide_button: z.string().trim().min(1).max(24).optional(),
  package_title: z.string().trim().max(80).optional(),
  template_title: z.string().trim().max(80).optional(),
  show_logo: z.boolean().optional(),
  show_tagline: z.boolean().optional(),
  show_mirror_toggle: z.boolean().optional(),
  allow_zoom_pan: z.boolean().optional(),
  guide_steps: z.array(z.string().trim().min(1).max(160)).max(8).optional(),
  pages: z
    .object({
      welcome: appearancePageSchema.optional(),
      guide: appearancePageSchema.optional(),
      package: appearancePageSchema.optional(),
      payment: appearancePageSchema.optional(),
      template: appearancePageSchema.optional(),
      capture: appearancePageSchema.optional(),
      edit: appearancePageSchema.optional(),
      result: appearancePageSchema.optional(),
    })
    .optional(),
});

// ---------------------------------------------------------------------------
// Kepemilikan setelan: cloud (uang) vs device (mesin).
//
// Satu tabel dipakai tiga pihak — `PUT /v1/settings` di runtime, `PATCH
// /api/v1/public/devices/settings` di cloud, dan kiosk — supaya aturannya tidak
// pernah berbeda pendapat. Field cloud DITOLAK (403), bukan dibuang diam-diam.
// ---------------------------------------------------------------------------

/**
 * Daftar grup dan kepemilikan berasal dari satu kontrak yang dipakai cloud dan
 * runtime lokal. Jangan menyalin aturannya di sini.
 *
 * `appearance_settings` sengaja TIDAK ikut cloud-sync: kustomisasi tampilan
 * berlaku untuk satu booth dan tidak boleh menular ke booth lain lewat baris
 * `photoboxes`. Cloud menolak grup ini dengan `LOCAL_ONLY_SETTING`, bukan
 * membuangnya diam-diam.
 */
export type DeviceSettingGroup = (typeof DEVICE_SETTING_GROUPS)[number];

export {
  CLOUD_OWNED_SETTING_FIELDS,
  CLOUD_SYNCED_DEVICE_GROUPS,
  DEVICE_SETTING_FIELDS,
  DEVICE_SETTING_GROUPS,
  LOCAL_ONLY_DEVICE_GROUPS,
};

export function isLocalOnlySettingGroup(key: string): boolean {
  return (LOCAL_ONLY_DEVICE_GROUPS as readonly string[]).includes(key);
}

/** Setelan yang boleh ditulis device. `strict()`: kunci asing ditolak. */
export const deviceSettingsSchema = z
  .object({
    camera_settings: cameraSettingsSchema.optional(),
    print_settings: printSettingsSchema.optional(),
    session_settings: sessionSettingsSchema.optional(),
    appearance_settings: appearanceSettingsSchema.optional(),
  })
  .strict();

export type DeviceSettingsInput = z.infer<typeof deviceSettingsSchema>;

const DEVICE_SETTING_SHAPES: Record<DeviceSettingGroup, Record<string, unknown>> = {
  camera_settings: cameraSettingsSchema.shape,
  print_settings: printSettingsSchema.shape,
  session_settings: sessionSettingsSchema.shape,
  appearance_settings: appearanceSettingsSchema.shape,
};

export function isDeviceSettingGroup(key: string): key is DeviceSettingGroup {
  return (DEVICE_SETTING_GROUPS as readonly string[]).includes(key);
}

/** Nama field yang boleh ditulis device pada satu grup. */
export function deviceSettingFields(group: DeviceSettingGroup): string[] {
  return [...DEVICE_SETTING_FIELDS[group]].filter(
    (key) => !CLOUD_OWNED_SETTING_FIELDS[group].includes(key)
  );
}

/**
 * Nama field di zod schema untuk satu grup — dipakai tes paritas agar daftar di
 * JSON Schema dan validator zod tidak pernah berbeda pendapat.
 */
export function zodDeviceSettingFields(group: DeviceSettingGroup): string[] {
  return Object.keys(DEVICE_SETTING_SHAPES[group]);
}

/**
 * Grup setelan yang HANYA boleh ditulis ke runtime lokal, tidak ke cloud.
 *
 * `appearance_settings` = kustomisasi tampilan satu booth. Kalau grup ini
 * diterima `PATCH /api/v1/public/devices/settings`, satu booth yang mengganti
 * warna latar akan menulis ke baris `photoboxes` yang dibaca semua booth.
 * Pemanggil menjawab 403 `LOCAL_ONLY_SETTING`, bukan membuangnya diam-diam.
 */
export function localOnlySettingKeys(payload: Record<string, unknown>): string[] {
  return Object.keys(payload).filter((key) => isLocalOnlySettingGroup(key));
}

/**
 * Field di payload yang BUKAN milik device. Kosong berarti payload boleh
 * ditulis; selain itu pemanggil menjawab 403 `FIELD_NOT_DEVICE_OWNED`.
 */
export function foreignSettingKeys(payload: Record<string, unknown>): string[] {
  const foreign: string[] = [];
  for (const [key, value] of Object.entries(payload)) {
    if (!isDeviceSettingGroup(key)) {
      foreign.push(key);
      continue;
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const allowed = deviceSettingFields(key);
    for (const nested of Object.keys(value)) {
      if (!allowed.includes(nested)) foreign.push(`${key}.${nested}`);
    }
  }
  return foreign;
}

/**
 * Salin field device di atas nilai cloud, per-key. Field cloud (`copies`,
 * `layout`, `payment_mode`, …) dan kunci yang tidak dikirim tetap apa adanya —
 * laporan device yang hanya tahu `paper_size` tidak boleh menghapus `copies`.
 */
export function mergeDeviceSettings<T extends object>(
  cloud: T,
  device: DeviceSettingsInput | Partial<Record<DeviceSettingGroup, Record<string, unknown>>>
): T {
  const out = { ...cloud } as Record<string, unknown>;
  for (const group of DEVICE_SETTING_GROUPS) {
    const incoming = device[group];
    if (!incoming) continue;
    const base = out[group];
    const merged: Record<string, unknown> =
      base && typeof base === "object" && !Array.isArray(base)
        ? { ...(base as Record<string, unknown>) }
        : {};
    for (const [key, value] of Object.entries(incoming)) {
      if (value === undefined) continue;
      if (CLOUD_OWNED_SETTING_FIELDS[group].includes(key)) continue;
      merged[key] = value;
    }
    out[group] = merged;
  }
  return out as T;
}

export const outletCreateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Nama outlet minimal 2 karakter")
    .max(80, "Nama outlet maksimal 80 karakter"),
  address: z.string().trim().max(200).optional(),
  city: z.string().trim().max(80).optional(),
  province: z.string().trim().max(80).optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

export const outletUpdateSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  address: z.string().trim().max(200).nullable().optional(),
  city: z.string().trim().max(80).nullable().optional(),
  province: z.string().trim().max(80).nullable().optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

export const photoboxCreateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Nama photobox minimal 2 karakter")
    .max(80, "Nama photobox maksimal 80 karakter"),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Slug minimal 3 karakter")
    .max(48, "Slug maksimal 48 karakter")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug hanya boleh huruf kecil, angka, dan tanda hubung")
    .optional(),
  outlet_id: uuid.refine((value) => value.length > 0, "Outlet wajib dipilih"),
  status: photoboxStatus.optional(),
  camera: z.string().trim().max(120).optional(),
  printer: z.string().trim().max(120).optional(),
  display: z.string().trim().max(120).optional(),
  chroma_key_enabled: z.boolean().optional(),
  camera_settings: cameraSettingsSchema.optional(),
  print_settings: printSettingsSchema.optional(),
  session_settings: sessionSettingsSchema.optional(),
  /** PIN keluar kiosk 4–8 digit — opsional saat create (hash di server). */
  exit_pin: z
    .string()
    .trim()
    .regex(/^\d{4,8}$/, "PIN keluar 4–8 digit angka")
    .optional(),
  /** Saluran pembayaran per-booth; null/undefined = gateway + voucher. */
  payment_mode: photoboxPaymentMode.nullable().optional(),
});

export const photoboxUpdateSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(48)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug hanya boleh huruf kecil, angka, dan tanda hubung")
    .optional(),
  outlet_id: z.string().guid().optional(),
  status: photoboxStatus.optional(),
  camera: z.string().trim().max(120).nullable().optional(),
  printer: z.string().trim().max(120).nullable().optional(),
  display: z.string().trim().max(120).nullable().optional(),
  chroma_key_enabled: z.boolean().optional(),
  camera_settings: cameraSettingsSchema.optional(),
  print_settings: printSettingsSchema.optional(),
  session_settings: sessionSettingsSchema.optional(),
  /** PIN keluar kiosk 4–8 digit — kosong = tidak diubah (hash di server). */
  exit_pin: z
    .string()
    .trim()
    .regex(/^\d{4,8}$/, "PIN keluar 4–8 digit angka")
    .optional(),
  /** Saluran pembayaran per-booth; null = gateway + voucher. */
  payment_mode: photoboxPaymentMode.nullable().optional(),
});

// --- Owner Platform — docs/04 §4.2–4.13, schema contract docs/08 §8.19 ---

const idArray = z.array(uuid).max(200);

export const packageCreateSchema = z.object({
  name: z.string().trim().min(1, "Nama package wajib diisi").max(80, "Nama maksimal 80 karakter"),
  price: z.number().int("Harga harus integer").positive("Harga harus > 0"),
  photo_count: z.number().int().min(1, "Jumlah foto ≥ 1").max(50),
  print_count: z.number().int().min(0, "Jumlah cetak ≥ 0").max(50),
  digital_output: z.boolean().optional().default(false),
  capture_mode: z.enum(["single", "burst", "photostrip"]).optional().default("single"),
  description: z.string().trim().max(500).optional(),
  is_active: z.boolean().optional().default(true),
  template_ids: idArray.optional().default([]),
  outlet_ids: idArray.optional().default([]),
  photobox_ids: idArray.optional().default([]),
});

export const packageUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  price: z.number().int().positive().optional(),
  photo_count: z.number().int().min(1).max(50).optional(),
  print_count: z.number().int().min(0).max(50).optional(),
  digital_output: z.boolean().optional(),
  capture_mode: z.enum(["single", "burst", "photostrip"]).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  is_active: z.boolean().optional(),
  template_ids: idArray.optional(),
  outlet_ids: idArray.optional(),
  photobox_ids: idArray.optional(),
});

export const TEMPLATE_CATEGORIES = [
  "minimal",
  "cute",
  "retro",
  "y2k",
  "wedding",
  "birthday",
  "graduation",
  "event",
  "custom",
] as const;

export const templateCreateSchema = z.object({
  name: z.string().trim().min(1, "Nama template wajib diisi").max(80),
  category: z.enum(TEMPLATE_CATEGORIES),
  file_url: z.string().trim().min(1, "File frame wajib").max(300),
  thumbnail_url: z.string().trim().max(300).nullable().optional(),
  /** Layout slot builder — docs/15 §15.2 (null/undefined = template legacy). */
  layout: layoutSchema.nullable().optional(),
  is_active: z.boolean().optional().default(true),
});

export const templateUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  category: z.enum(TEMPLATE_CATEGORIES).optional(),
  layout: layoutSchema.nullable().optional(),
  is_active: z.boolean().optional(),
});

const voucherCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{3,32}$/, "Kode 3–32 karakter huruf besar/angka");

const isoDateTime = z.string().datetime({ offset: true }).or(z.string().datetime());

const voucherBaseSchema = z.object({
  code: voucherCode,
  type: z.enum(["percentage", "fixed"], { error: "Tipe diskon tidak valid" }),
  amount: z
    .number({ error: "Nilai diskon wajib diisi angka" })
    .int()
    .positive("Nilai diskon harus > 0"),
  start_date: isoDateTime.nullable().optional(),
  end_date: isoDateTime.nullable().optional(),
  usage_limit: z
    .number({ error: "Usage limit wajib angka" })
    .int()
    .min(0, "Usage limit minimal 0")
    .nullable()
    .optional(),
  usage_per_customer: z
    .number({ error: "Usage per customer wajib angka" })
    .int()
    .min(1, "Usage per customer minimal 1")
    .max(100, "Usage per customer maksimal 100")
    .optional()
    .default(1),
  min_transaction: z
    .number({ error: "Minimum transaksi wajib angka" })
    .int()
    .min(0, "Minimum transaksi minimal 0")
    .optional()
    .default(0),
  max_discount: z
    .number({ error: "Maksimum diskon wajib angka" })
    .int()
    .min(0, "Maksimum diskon minimal 0")
    .nullable()
    .optional(),
  is_active: z.boolean().optional().default(true),
  package_ids: idArray.optional().default([]),
  outlet_ids: idArray.optional().default([]),
});

export const voucherCreateSchema = voucherBaseSchema
  .refine(
    (v) => !v.start_date || !v.end_date || Date.parse(v.start_date) <= Date.parse(v.end_date),
    { message: "start_date harus ≤ end_date", path: ["start_date"] }
  )
  .refine((v) => v.type !== "percentage" || v.amount <= 100, {
    message: "Diskon persen maksimal 100",
    path: ["amount"],
  });

// zod v4: .partial() hanya pada object schema — jangan partial hasil refine.
export const voucherUpdateSchema = voucherBaseSchema
  .partial()
  .refine(
    (v) => !v.start_date || !v.end_date || Date.parse(v.start_date) <= Date.parse(v.end_date),
    { message: "start_date harus ≤ end_date", path: ["start_date"] }
  )
  .refine((v) => v.type !== "percentage" || v.amount === undefined || v.amount <= 100, {
    message: "Diskon persen maksimal 100",
    path: ["amount"],
  });

/**
 * Invariant diskon yang bergantung pada type: persentase maksimal 100.
 * Dipakai pada create DAN update parsial setelah merge dengan row tersimpan,
 * supaya `{ amount: 500 }` tanpa `type` tidak bisa lolos pada voucher
 * percentage yang sudah ada.
 */
export function discountAmountError(
  type: string | null | undefined,
  amount: number | null | undefined
): string | null {
  if (amount === undefined || amount === null) return null;
  if (!Number.isInteger(amount) || amount <= 0) return "Nilai diskon harus > 0";
  if (type === "percentage" && amount > 100) return "Diskon persen maksimal 100";
  return null;
}

export function voucherInvariantError(
  current: {
    type: string;
    amount: number;
    start_date: string | null;
    end_date: string | null;
    min_transaction: number;
    max_discount: number | null;
  },
  patch: Partial<{
    type: string;
    amount: number;
    start_date: string | null;
    end_date: string | null;
    min_transaction: number;
    max_discount: number | null;
  }>
): { path: string[]; message: string }[] {
  const merged = { ...current, ...patch };
  const issues: { path: string[]; message: string }[] = [];

  const amountError = discountAmountError(merged.type, merged.amount);
  if (amountError) issues.push({ path: ["amount"], message: amountError });

  if (
    merged.start_date &&
    merged.end_date &&
    Date.parse(merged.start_date) > Date.parse(merged.end_date)
  ) {
    issues.push({ path: ["start_date"], message: "start_date harus ≤ end_date" });
  }

  if (
    merged.max_discount !== null &&
    merged.max_discount !== undefined &&
    merged.max_discount < 0
  ) {
    issues.push({ path: ["max_discount"], message: "Maksimum diskon minimal 0" });
  }

  return issues;
}

export const EXPENSE_CATEGORIES = [
  "rent",
  "electricity",
  "internet",
  "paper",
  "ink",
  "maintenance",
  "staff",
  "equipment",
  "advertising",
  "other",
] as const;

const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal YYYY-MM-DD")
  .refine((v) => {
    // Tolak tanggal kalender invalid (mis. 2020-99-99): nilai ini bikin
    // timestamp Postgres invalid lalu 500, jadi wajib divalidasi di boundary.
    const d = new Date(`${v}T00:00:00.000Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "Tanggal tidak valid");
const isoDate = isoDay;

export const expenseCreateSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES),
  amount: z.number().int("Nominal harus integer").positive("Nominal harus > 0"),
  note: z.string().trim().max(200, "Catatan maksimal 200 karakter").optional(),
  expense_date: isoDay,
  outlet_id: uuid.nullable().optional(),
});

export const expenseUpdateSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES).optional(),
  amount: z.number().int().positive().optional(),
  note: z.string().trim().max(200).nullable().optional(),
  expense_date: isoDay.optional(),
  outlet_id: uuid.nullable().optional(),
});

export const manualTransactionSchema = z.object({
  outlet_id: uuid.refine((value) => value.length > 0, "Outlet wajib dipilih"),
  photobox_id: uuid.refine((value) => value.length > 0, "Photobox wajib dipilih"),
  package_id: uuid.nullable().optional(),
  // Pencatatan manual owner SELALU 'manual' (non-withdrawable) — bukan
  // 'cash'/'bank_transfer' generik. Backend = source of truth.
  payment_method: z.literal("manual"),
  gross_amount: z.number().int().positive("Gross harus > 0"),
  discount_amount: z.number().int().min(0).optional().default(0),
  note: z.string().trim().max(200).optional(),
});

export const staffInviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Format email tidak valid"),
  role: z.enum(["manager", "staff"], { message: "Role undangan: manager atau staff" }),
});

// --- POS add-on — docs/pos/01 §5, docs/pos/02 §5.2 ---------------------------

const idrPrice = z
  .number()
  .int("Harga harus integer IDR")
  .min(1000, "Harga minimal Rp 1.000")
  .max(2_000_000_000, "Harga terlalu besar");

const posProductFields = {
  name: z.string().trim().min(1, "Nama produk wajib diisi").max(120, "Nama maksimal 120 karakter"),
  sku: z.string().trim().max(40, "SKU maksimal 40 karakter").nullable().optional(),
  category: z
    .string()
    .trim()
    .min(1, "Kategori wajib diisi")
    .max(40, "Kategori maksimal 40 karakter"),
  description: z.string().trim().max(500, "Deskripsi maksimal 500 karakter").nullable().optional(),
  price: idrPrice,
  cost: z
    .number()
    .int("Cost harus integer IDR")
    .min(0, "Cost tidak boleh negatif")
    .max(2_000_000_000)
    .nullable()
    .optional(),
  stock: z
    .number()
    .int("Stock harus integer")
    .min(0, "Stock tidak boleh negatif")
    .max(1_000_000)
    .nullable()
    .optional(),
  image_url: z.string().trim().max(500).nullable().optional(),
};

export const posProductCreateSchema = z
  .object(posProductFields)
  .extend({ category: posProductFields.category.optional().default("lainnya" as const) });

export const posProductUpdateSchema = z
  .object(posProductFields)
  .partial()
  .extend({ id: uuid })
  .refine((v) => Object.keys(v).length > 1, { message: "Minimal satu field diubah" });

export const posOrderItemSchema = z.object({
  productId: uuid,
  qty: z.number().int("Qty harus integer").min(1, "Qty minimal 1").max(999, "Qty maksimal 999"),
});

export const posOrderCreateSchema = z.object({
  photoboxId: uuid,
  items: z
    .array(posOrderItemSchema)
    .min(1, "Keranjang tidak boleh kosong")
    .max(50, "Maksimal 50 item per order"),
});

export const posManualPaySchema = z.object({
  orderId: uuid,
  method: z.enum(["cash", "bank_transfer", "other"]),
});

export const staffUpdateSchema = z.object({
  role: z.enum(["owner", "manager", "staff"]),
});

export const txStatusEnum = z.enum(["pending", "paid", "failed", "cancelled", "refunded"]);

const stripEmptyStrings = <T extends z.ZodType>(schema: T) =>
  z.preprocess(
    (obj) =>
      obj && typeof obj === "object"
        ? Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== ""))
        : obj,
    schema
  );

/**
 * Query string berasal dari URL yang bisa diketik/di-bookmark, jadi nilai rusak
 * (mis. `?page=abc`, `?status=foo`) DIBUANG lewat `.catch()`, bukan melempar
 * ZodError yang menjatuhkan halaman via error boundary. Pola sama dengan
 * `coerceDateFields` di `@/lib/dashboard-math`.
 */
export const transactionListQuerySchema = stripEmptyStrings(
  z.object({
    status: txStatusEnum.optional().catch(undefined),
    outlet: uuid.optional().catch(undefined),
    photobox: uuid.optional().catch(undefined),
    package: uuid.optional().catch(undefined),
    method: z
      .enum(["qris", "cash", "bank_transfer", "other", "offline", "manual", "voucher"])
      .optional()
      .catch(undefined),
    source: z.enum(["pos", "kiosk"]).optional().catch(undefined), // docs/pos/05, filter sumber
    from: isoDate.optional().catch(undefined),
    to: isoDate.optional().catch(undefined),
    q: z.string().trim().max(120).optional().catch(undefined),
    page: z.coerce.number().int().min(1).optional().catch(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().catch(20).default(20),
  })
);

export const listQuerySchema = z.object({
  q: z.string().trim().max(120).optional().catch(undefined),
  page: z.coerce.number().int().min(1).optional().catch(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().catch(20).default(20),
});

export const reportQuerySchema = z
  .object({
    type: z.enum([
      "daily",
      "weekly",
      "monthly",
      "revenue",
      "transactions",
      "outlet",
      "photobox",
      "expenses",
      "voucher",
    ]),
    from: isoDate,
    to: isoDate,
    format: z.enum(["csv", "xlsx"]),
  })
  // Rentang terbalik / terlalu panjang bikin export senyap-kosong atau loop
  // harian tanpa batas (OOM). Selaras dateRangeSchema + MAX_RANGE_DAYS.
  .refine((v) => v.from <= v.to, {
    message: "'from' harus ≤ 'to'",
    path: ["from"],
  })
  .refine((v) => rangeDays(v.from, v.to) <= MAX_RANGE_DAYS, {
    message: `Rentang maksimal ${MAX_RANGE_DAYS} hari`,
    path: ["to"],
  });

/** Aktivasi device — docs/05 §5.0 API (kode sekali pakai). */
export const deviceActivateSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(6, "Kode aktivasi 6 karakter")
    .max(6, "Kode aktivasi 6 karakter")
    .regex(/^[A-Z0-9]{6}$/, "Format kode aktivasi tidak valid"),
});

/** Verifikasi device (boot/reload) — docs/05 §5.0 API. */
export const deviceVerifySchema = z.object({
  device_token: z.string().trim().min(32, "Device token tidak valid").max(128),
});

/** Keluar mode kiosk — PIN diverifikasi server (docs/05 §5.0 Keamanan). */
export const deviceExitSchema = z.object({
  device_token: z.string().trim().min(32).max(128),
  pin: z
    .string()
    .trim()
    .regex(/^\d{4,8}$/, "PIN keluar 4–8 digit angka")
    .optional(),
});

/** Laporan status device (setup wizard) — docs/05 §5.0.1. */
export const deviceReportSchema = z.object({
  device_token: z.string().trim().min(32).max(128),
  preferred_device_id: z.string().trim().max(200).nullable().optional(),
  camera: z
    .object({
      resolution: z.string().trim().max(40).optional(),
      width: z.number().int().nonnegative().optional(),
      error: z.string().trim().max(200).nullable().optional(),
    })
    .optional(),
  printer: z
    .object({
      confirmed: z.boolean().optional(),
      last_test_at: z.string().trim().max(40).optional(),
      /** Jalur cetak yang diuji: dialog OS atau thermal Bluetooth. */
      mode: z.enum(["browser", "bluetooth"]).optional(),
      /** Nama printer yang diuji (informasi petugas). */
      device_name: z.string().trim().max(60).optional(),
    })
    .optional(),
});

/**
 * Tulis balik setelan device ke cloud — `PATCH /api/v1/public/devices/settings`.
 *
 * Payload = setelan device + `device_token`. Field cloud (mis.
 * `print_settings.copies`) tidak ditolak di sini karena bentuk schema-nya
 * ketat: route memeriksa `foreignSettingKeys` lebih dulu agar pesan errornya
 * menyebut field mana yang bukan milik device.
 */
export const deviceSettingsPatchSchema = z.object({
  device_token: z.string().trim().min(32).max(128),
  settings: deviceSettingsSchema,
});

export type DeviceSettingsPatchInput = z.infer<typeof deviceSettingsPatchSchema>;

/**
 * Waktu jual sesi menurut booth, untuk sync worker runtime lokal.
 *
 * Tanpa ini laporan harian owner mencatat transaksi pada waktu sync, bukan
 * waktu pelanggan benar-benar difoto — booth yang offline semalam menumpuk
 * semua penjualannya di hari reconnect. Masa depan ditolak (jam booth salah)
 * dan masa lalu >24 jam ditolak (bukan sesi yang masih relevan).
 */
export const SESSION_CLIENT_CREATED_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export const sessionClientCreatedAtSchema = z.iso
  .datetime({ offset: true, error: "client_created_at harus ISO 8601" })
  .refine(
    (value) => new Date(value).getTime() <= Date.now(),
    "client_created_at tidak boleh di masa depan"
  )
  .refine(
    (value) => Date.now() - new Date(value).getTime() <= SESSION_CLIENT_CREATED_MAX_AGE_MS,
    "client_created_at maksimal 24 jam lampau"
  );

/**
 * Buat sesi kiosk — docs/08 §8.14.
 * v2 pay-first: syarat checkout_session paid; saat DEV_SKIP_PAYMENT aktif,
 * `package_id` dipakai untuk membuat checkout paid sintetik (docs/12 Phase 4).
 */
export const sessionCreateSchema = z
  .object({
    checkout_session_id: uuid.optional(),
    package_id: uuid.optional(),
    device_token: z.string().trim().min(32).max(128),
    /** Waktu sesi dibuat di booth (sync offline). Diabaikan tanpa `package_id`. */
    client_created_at: sessionClientCreatedAtSchema.optional(),
  })
  .refine((v) => v.checkout_session_id || v.package_id, {
    message: "checkout_session_id atau package_id wajib diisi",
  });

/** Finalize sesi — body JSON berisi metadata; foto via multipart `photos`. */
export const sessionFinalizeSchema = z.object({
  device_token: z.string().trim().min(32).max(128),
  retake_count: z.number().int().nonnegative().optional(),
  template_id: uuid.nullable().optional(),
});

/** Abort sesi aktif oleh kiosk itu sendiri (customer reset selesai tanpa foto). */
export const sessionAbortSchema = z.object({
  device_token: z.string().trim().min(32).max(128),
});

/** Buat checkout pay-first — docs/08 §8.14 (SEBELUM sesi foto). */
export const checkoutCreateSchema = z.object({
  package_id: uuid,
  voucher_code: z
    .string()
    .trim()
    .toUpperCase()
    .max(40, "Kode voucher maksimal 40 karakter")
    .optional(),
  device_token: z.string().trim().min(32).max(128),
});

/** Terapkan voucher ke checkout — docs/08 §8.14 / docs/06 §6.2. */
export const checkoutApplyVoucherSchema = z.object({
  checkout_session_id: uuid,
  voucher_code: z.string().trim().toUpperCase().min(1, "Kode voucher wajib diisi").max(40),
  device_token: z.string().trim().min(32).max(128),
});

/** Buat payment kiosk ternormalisasi — amount/provider selalu diputuskan server. */
export const paymentCreateSchema = z.object({
  checkout_session_id: uuid,
  device_token: z.string().trim().min(32).max(128),
  method_id: z.string().trim().min(1).max(80),
});

/** Konfirmasi cash juga mewajibkan Auth.js session di route. */
export const cashConfirmSchema = z.object({
  payment_reference: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{6,40}$/),
  device_token: z.string().trim().min(32).max(128),
});

/** Cek status payment (recover saat reload) — device_token via query param. */
export const paymentStatusQuerySchema = z.object({
  device_token: z.string().trim().min(32).max(128),
});

export type DeviceActivateInput = z.infer<typeof deviceActivateSchema>;
export type DeviceVerifyInput = z.infer<typeof deviceVerifySchema>;
export type DeviceExitInput = z.infer<typeof deviceExitSchema>;
export type DeviceReportInput = z.infer<typeof deviceReportSchema>;
export type SessionCreateInput = z.infer<typeof sessionCreateSchema>;
export type SessionFinalizeInput = z.infer<typeof sessionFinalizeSchema>;
export type SessionAbortInput = z.infer<typeof sessionAbortSchema>;
export type CheckoutCreateInput = z.infer<typeof checkoutCreateSchema>;
export type CheckoutApplyVoucherInput = z.infer<typeof checkoutApplyVoucherSchema>;
export type PaymentCreateInput = z.infer<typeof paymentCreateSchema>;
// Removed (Fase 5): CashConfirmInput, PaymentStatusQueryInput — zero konsumen.

export type RegisterInput = z.infer<typeof registerSchema>;
// Removed (Fase 5): LoginInput — zero konsumen (form login pakai FormData langsung).
export type BusinessCreateInput = z.infer<typeof businessCreateSchema>;
export type BusinessUpdateInput = z.infer<typeof businessUpdateSchema>;
export type BusinessSettingsUpdateInput = z.infer<typeof businessSettingsUpdateSchema>;
// Removed (Fase 5): CheckoutSettingsInput, KioskBrandingInput — zero konsumen.
export type BrandingInput = z.infer<typeof brandingSchema>;
export type OutletCreateInput = z.infer<typeof outletCreateSchema>;
export type OutletUpdateInput = z.infer<typeof outletUpdateSchema>;
export type PhotoboxCreateInput = z.infer<typeof photoboxCreateSchema>;
export type PhotoboxUpdateInput = z.infer<typeof photoboxUpdateSchema>;
export type ManualTransactionInput = z.infer<typeof manualTransactionSchema>;
export type VoucherCreateInput = z.infer<typeof voucherCreateSchema>;
export type VoucherUpdateInput = z.infer<typeof voucherUpdateSchema>;
export type TemplateCreateInput = z.infer<typeof templateCreateSchema>;
export type TemplateUpdateInput = z.infer<typeof templateUpdateSchema>;
export type StaffInviteInput = z.infer<typeof staffInviteSchema>;
export type StaffUpdateInput = z.infer<typeof staffUpdateSchema>;
export type PackageCreateInput = z.infer<typeof packageCreateSchema>;
export type PackageUpdateInput = z.infer<typeof packageUpdateSchema>;
export type ExpenseCreateInput = z.infer<typeof expenseCreateSchema>;
export type ExpenseUpdateInput = z.infer<typeof expenseUpdateSchema>;
export type PosProductCreateInput = z.infer<typeof posProductCreateSchema>;
export type PosProductUpdateInput = z.infer<typeof posProductUpdateSchema>;
export type PosOrderCreateInput = z.infer<typeof posOrderCreateSchema>;
export type PosManualPayInput = z.infer<typeof posManualPaySchema>;

// ---------------------------------------------------------------------------
// Admin platform — docs/10 §10.2–10.4, docs/08 §8.14 (prefix /api/v1/admin)
// ---------------------------------------------------------------------------

/** Feature flags plan — keys tetap terbuka (plan-driven, docs/02 §2.6). */
export const planFeaturesSchema = z.record(z.string(), z.boolean());

const priceIdr = z
  .number()
  .int("Harga harus integer IDR")
  .min(0, "Harga minimal 0")
  .max(2_000_000_000, "Harga terlalu besar");

export const adminPlanCreateSchema = z.object({
  code: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, "Kode plan minimal 2 karakter")
    .max(32)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Kode hanya huruf kecil, angka, dan tanda hubung"),
  name: z.string().trim().min(2, "Nama plan minimal 2 karakter").max(80),
  price_monthly: priceIdr,
  price_yearly: priceIdr.nullable().optional(),
  billing_cycle: z.enum(["monthly", "yearly"]).optional(),
  max_businesses: z.number().int().min(1).max(1000).optional(),
  max_outlets: z.number().int().min(1).max(1000).optional(),
  max_photoboxes: z.number().int().min(1).max(1000).optional(),
  max_concurrent_sessions: z.number().int().min(1).max(1000).optional(),
  max_staff: z.number().int().min(0).max(1000).optional(),
  max_packages: z.number().int().min(1).max(10000).optional(),
  max_templates: z.number().int().min(1).max(10000).optional(),
  storage_limit_mb: z.number().int().min(0).max(1_000_000).optional(),
  platform_fee_percent: z.number().min(0).max(100).optional(),
  platform_fee_flat: priceIdr.optional(),
  features: planFeaturesSchema.optional(),
  is_active: z.boolean().optional(),
});

export const adminPlanUpdateSchema = adminPlanCreateSchema
  .omit({ code: true })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "Minimal satu field diubah" });

export const adminAddOnCreateSchema = z.object({
  code: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, "Kode add-on minimal 2 karakter")
    .max(32)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Kode hanya huruf kecil, angka, dan tanda hubung"),
  name: z.string().trim().min(2, "Nama add-on minimal 2 karakter").max(80),
  price_monthly: priceIdr,
  unit: z.string().trim().min(1, "Unit wajib diisi").max(32).optional(),
  storage_mb: z
    .number()
    .int("Storage harus integer MB")
    .min(1, "Storage minimal 1 MB")
    .max(1_000_000, "Storage maksimal 1.000.000 MB")
    .nullable()
    .optional(),
  is_active: z.boolean().optional(),
});

export const adminAddOnUpdateSchema = adminAddOnCreateSchema
  .omit({ code: true })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "Minimal satu field diubah" });

export const adminUserUpdateSchema = z
  .object({
    status: z.enum(["active", "suspended"]).optional(),
    role: z.enum(["user", "admin"]).optional(),
  })
  .refine((v) => v.status !== undefined || v.role !== undefined, {
    message: "Minimal satu field diubah",
  });

/** Admin CEO membuat user langsung — pendaftaran mandiri ditutup. */
export const adminUserCreateSchema = z.object({
  name: z.string().trim().min(1, "Nama wajib diisi").max(80, "Nama maksimal 80 karakter"),
  email: z.string().trim().toLowerCase().email("Format email tidak valid").max(254),
  password: z
    .string()
    .min(8, "Password minimal 8 karakter")
    .max(72, "Password maksimal 72 karakter"),
  role: z.enum(["user", "admin"]).default("user"),
});

export const adminBusinessUpdateSchema = z
  .object({
    status: z.enum(["active", "suspended"]),
  })
  .refine((v) => v.status !== undefined, { message: "Status wajib diisi" });

export const adminSubscriptionUpdateSchema = z
  .object({
    status: z.enum(["trial", "active", "past_due", "cancelled", "expired"]).optional(),
    extend_days: z.number().int().min(1, "Minimal 1 hari").max(730).optional(),
    cancel: z.boolean().optional(),
  })
  .refine((v) => v.status !== undefined || v.extend_days !== undefined || v.cancel, {
    message: "Minimal satu aksi diisi",
  });

/**
 * Filter payment monitoring admin (docs/10 §10.3): `from`/`to` wajib
 * YYYY-MM-DD agar tidak menjadi timestamp Postgres yang invalid lalu 500.
 */
export const adminPaymentQuerySchema = stripEmptyStrings(
  z.object({
    status: z.enum(["paid", "pending", "failed", "expired", "cancelled", "refunded"]).optional(),
    provider: z.enum(["pakasir", "midtrans", "tripay"]).optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
);

/** Platform settings — key whitelist (docs/10 §10.4). */
export const adminSettingsUpdateSchema = z
  .object({
    platform_fee_percent: z.number().min(0).max(100).optional(),
    platform_fee_flat: priceIdr.optional(),
    // Default retention DITERAPKAN ke SEMUA tenant (lihat src/server/admin/settings.ts),
    // jadi batasnya WAJIB sama dengan jaminan privasi jalur tenant: 1–3 hari,
    // bukan 365. Rentang dari satu sumber agar kedua jalur tak bisa melonggar sendiri.
    default_retention_days: z
      .number()
      .int()
      .min(RETENTION_MIN_DAYS, "Retensi minimal 1 hari")
      .max(RETENTION_MAX_DAYS, "Retensi maksimal 3 hari (kebijakan privasi)")
      .optional(),
    trial_days: z.number().int().min(0).max(365).optional(),
    maintenance_mode: z.boolean().optional(),
    maintenance_message: z.string().trim().max(300, "Pesan maksimal 300 karakter").optional(),
    chroma_key_default_enabled: z.boolean().optional(),
    gateway_pakasir_enabled: z.boolean().optional(),
    gateway_midtrans_enabled: z.boolean().optional(),
    gateway_tripay_enabled: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Minimal satu setting diubah" });

export const adminGlobalTemplateCreateSchema = z.object({
  name: z.string().trim().min(1, "Nama template wajib").max(80),
  category_id: uuid,
  file_url: z.string().trim().min(1, "URL frame wajib").max(300),
  thumbnail_url: z.string().trim().max(300).nullable().optional(),
  is_active: z.boolean().optional().default(true),
  price: z.number().int().min(0, "Harga minimal 0").nullable().optional(),
  is_premium: z.boolean().optional().default(false),
  layout: z
    .union([layoutSchema, z.record(z.string(), z.unknown())])
    .nullable()
    .optional(),
});

export const adminTemplateCategoryCreateSchema = z.object({
  name: z.string().trim().min(2, "Nama kategori minimal 2 karakter").max(60),
  price: z.number().int().min(0, "Harga minimal 0").nullable().optional(),
});

export const adminSubscriptionAddOnSchema = z.object({
  subscription_id: uuid,
  add_on_id: uuid,
  quantity: z.number().int().min(1, "Quantity minimal 1").max(100),
});

export const adminSubscriptionAddOnCancelSchema = z.object({
  mode: z.enum(["deferred", "immediate"]).default("deferred"),
  manual_cancel_reason: z.string().trim().max(200, "Alasan maksimal 200 karakter").optional(),
});

export const adminSubscriptionAddOnUpdateSchema = z
  .object({
    quantity: z.number().int().min(1, "Quantity minimal 1").max(100),
  })
  .refine((v) => v.quantity !== undefined, { message: "Quantity wajib diisi" });

/** Subscription promo (docs/10 §10.2, migration 0014). */
const promoCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{3,32}$/, "Kode 3–32 karakter huruf besar/angka");
const promoIsoDateTime = z.string().datetime({ offset: true }).or(z.string().datetime());

export const adminPromoCreateSchema = z
  .object({
    code: promoCode,
    type: z.enum(["percentage", "fixed"]),
    amount: z.number().int().positive("Nilai diskon harus > 0"),
    min_transaction: z.number().int().min(0).optional().default(0),
    max_discount: z.number().int().min(0).nullable().optional(),
    start_date: promoIsoDateTime.nullable().optional(),
    end_date: promoIsoDateTime.nullable().optional(),
    usage_limit: z.number().int().min(0).nullable().optional(),
    is_active: z.boolean().optional().default(true),
  })
  .refine((v) => v.type !== "percentage" || (v.amount >= 1 && v.amount <= 100), {
    path: ["amount"],
    message: "Persentase 1–100",
  })
  .refine((v) => !v.start_date || !v.end_date || new Date(v.end_date) >= new Date(v.start_date), {
    path: ["end_date"],
    message: "Tanggal berakhir harus >= tanggal mulai",
  });

/** Invariant promo setelah merge dengan row tersimpan (type-aware amount). */
export function promoInvariantError(
  current: { type: string; amount: number; start_date: string | null; end_date: string | null },
  patch: Partial<{
    type: string;
    amount: number;
    start_date: string | null;
    end_date: string | null;
  }>
): { path: string[]; message: string }[] {
  const merged = { ...current, ...patch };
  const issues: { path: string[]; message: string }[] = [];
  if (!Number.isInteger(merged.amount) || merged.amount <= 0) {
    issues.push({ path: ["amount"], message: "Nilai diskon harus > 0" });
  } else if (merged.type === "percentage" && merged.amount > 100) {
    issues.push({ path: ["amount"], message: "Persentase 1–100" });
  }
  if (
    merged.start_date &&
    merged.end_date &&
    Date.parse(merged.end_date) < Date.parse(merged.start_date)
  ) {
    issues.push({ path: ["end_date"], message: "Tanggal berakhir harus >= tanggal mulai" });
  }
  return issues;
}

export const adminPromoUpdateSchema = z
  .object({
    code: promoCode.optional(),
    type: z.enum(["percentage", "fixed"]).optional(),
    amount: z.number().int().positive().optional(),
    min_transaction: z.number().int().min(0).optional(),
    max_discount: z.number().int().min(0).nullable().optional(),
    start_date: promoIsoDateTime.nullable().optional(),
    end_date: promoIsoDateTime.nullable().optional(),
    usage_limit: z.number().int().min(0).nullable().optional(),
    is_active: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Minimal satu field diubah" })
  .refine(
    (v) => {
      const type = v.type;
      const amount = v.amount;
      if (amount === undefined) return true;
      if (type === "percentage") return amount >= 1 && amount <= 100;
      if (type === undefined) return amount >= 1;
      return amount >= 1;
    },
    { path: ["amount"], message: "Persentase 1–100" }
  )
  .refine((v) => !v.start_date || !v.end_date || new Date(v.end_date) >= new Date(v.start_date), {
    path: ["end_date"],
    message: "Tanggal berakhir harus >= tanggal mulai",
  });

/** Broadcast email (docs/10 — marketing/pengumuman), migration 0057/0058. */
export const broadcastCreateSchema = z.object({
  subject: z.string().trim().min(1, "Subjek wajib diisi").max(200, "Subjek maksimal 200 karakter"),
  body: z.string().trim().min(1, "Isi pesan wajib diisi"),
  kind: z.enum(["announcement", "promo", "newsletter", "event", "system"]).default("announcement"),
  template_key: z
    .enum(["default", "announcement", "promo", "newsletter", "event", "system"])
    .default("default"),
  audience: z.enum(["all", "users", "owners"]).default("all"),
  max_resend: z.number().int().min(0, "Minimal 0").max(10, "Maksimal 10").default(3),
});
export type BroadcastCreateInput = z.infer<typeof broadcastCreateSchema>;

export type AdminPlanCreateInput = z.infer<typeof adminPlanCreateSchema>;
export type AdminPlanUpdateInput = z.infer<typeof adminPlanUpdateSchema>;
export type AdminAddOnCreateInput = z.infer<typeof adminAddOnCreateSchema>;
export type AdminAddOnUpdateInput = z.infer<typeof adminAddOnUpdateSchema>;
export type AdminUserUpdateInput = z.infer<typeof adminUserUpdateSchema>;
export type AdminUserCreateInput = z.infer<typeof adminUserCreateSchema>;
// Removed (Fase 5): AdminBusinessUpdateInput — zero konsumen eksternal.
export type AdminSubscriptionUpdateInput = z.infer<typeof adminSubscriptionUpdateSchema>;
export type AdminSubscriptionAddOnUpdateInput = z.infer<typeof adminSubscriptionAddOnUpdateSchema>;
export type AdminSettingsUpdateInput = z.infer<typeof adminSettingsUpdateSchema>;
export type AdminGlobalTemplateCreateInput = z.infer<typeof adminGlobalTemplateCreateSchema>;
export type AdminPromoCreateInput = z.infer<typeof adminPromoCreateSchema>;
export type AdminPromoUpdateInput = z.infer<typeof adminPromoUpdateSchema>;
