/**
 * Setelan device: baca, tulis, export, import (`/v1/settings*`).
 *
 * Aturan yang mengikat modul ini (plan "Aturan kepemilikan setelan"):
 * yang berhubungan dengan uang milik cloud, yang berhubungan dengan mesin milik
 * device. `PUT` hanya menerima field device; field cloud dijawab
 * `403 FIELD_NOT_DEVICE_OWNED`, bukan dibuang diam-diam — operator harus tahu
 * setelannya tidak berlaku di sini.
 *
 * `mergeSettings(cloud, device)` adalah satu-satunya tempat aturan itu
 * diterapkan, supaya cloud yang mengirim `print_settings.copies` tidak pernah
 * tertimpa laporan device yang hanya tahu `paper_size`.
 */

import type { DatabaseSync } from "node:sqlite";
import type { RuntimeConfig } from "../config.ts";
import { getMeta, getSetting, setSetting } from "../db/index.ts";
import { HttpError, type RouteResult } from "../http.ts";
import {
  CLOUD_OWNED,
  DEVICE_GROUPS,
  SETTINGS_SCHEMA_VERSION,
  deviceSettingsSchema,
  foreignKeys,
  type CloudSettings,
  type DeviceGroup,
  type SettingsShape,
} from "./schema.ts";

export {
  DEVICE_GROUPS,
  SETTINGS_SCHEMA_VERSION,
  deviceFields,
  foreignKeys,
  type CloudSettings,
  type DeviceGroup,
  type SettingsShape,
} from "./schema.ts";

export const FIELD_NOT_DEVICE_OWNED = "FIELD_NOT_DEVICE_OWNED";
export const INVALID_SETTINGS = "INVALID_SETTINGS";
export const SCHEMA_VERSION_TOO_NEW = "SCHEMA_VERSION_TOO_NEW";
export const PHOTOBOX_MISMATCH = "PHOTOBOX_MISMATCH";

export type SettingsContext = {
  db: DatabaseSync;
  config: RuntimeConfig;
  now?: () => number;
};

function asObject(value: unknown, what: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(`${what} harus objek JSON.`, 400, INVALID_SETTINGS);
  }
  return value as Record<string, unknown>;
}

function storedGroup(db: DatabaseSync, group: DeviceGroup): Record<string, unknown> | null {
  const value = getSetting<unknown>(db, group);
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** Setelan yang tersimpan di store saja (tanpa nilai env). */
export function readDeviceSettings(db: DatabaseSync): SettingsShape {
  const out: SettingsShape = {};
  for (const group of DEVICE_GROUPS) {
    const value = storedGroup(db, group);
    if (value) out[group] = value;
  }
  return out;
}

/**
 * Nilai awal dari env — hanya untuk field yang env-nya memang ada.
 * `provider` menjawab "siapa yang memegang shutter": gphoto2 berarti runtime.
 */
export function defaultsFromConfig(config: RuntimeConfig): SettingsShape {
  return {
    camera_settings: { provider: config.camera === "gphoto2" ? "gphoto2" : "browser" },
  };
}

/** Setelan aktif: env sebagai alas, store di atasnya. */
export function activeSettings(db: DatabaseSync, config: RuntimeConfig): SettingsShape {
  const stored = readDeviceSettings(db);
  const out: SettingsShape = { ...defaultsFromConfig(config) };
  for (const group of DEVICE_GROUPS) {
    const value = stored[group];
    if (value) out[group] = { ...(out[group] ?? {}), ...value };
  }
  return out;
}

/**
 * Salin field device di atas cloud. Field cloud (`copies`, `layout`, …) tetap
 * apa adanya meski device mengirim grup yang sama.
 */
export function mergeSettings(cloud: CloudSettings, device: SettingsShape): CloudSettings {
  const out: CloudSettings = { ...cloud };
  for (const group of DEVICE_GROUPS) {
    const incoming = device[group];
    if (!incoming) continue;
    const merged: Record<string, unknown> = { ...(cloud[group] ?? {}) };
    for (const [key, value] of Object.entries(incoming)) {
      if (value === undefined) continue;
      if (CLOUD_OWNED[group].includes(key)) continue;
      merged[key] = value;
    }
    out[group] = merged;
  }
  return out;
}

/**
 * Adapter dipilih saat start dari setelan tersimpan; env tetap nilai awal bila
 * store kosong. Mock tidak pernah ditimpa setelan — kamera palsu di booth
 * berarti pelanggan membayar foto yang bukan dirinya.
 */
export function effectiveConfig(config: RuntimeConfig, settings: SettingsShape): RuntimeConfig {
  const provider = settings.camera_settings?.provider;
  const printMode = settings.print_settings?.mode;
  return {
    ...config,
    camera:
      config.camera !== "mock" && provider === "gphoto2" ? "gphoto2" : config.camera,
    printer: config.printer !== "mock" && printMode === "cups" ? "cups" : config.printer,
  };
}

/** Field cetak tersimpan, dipakai bila request kiosk tidak menyebutkannya. */
export function printDefaults(settings: SettingsShape): Record<string, unknown> {
  const stored = settings.print_settings ?? {};
  const out: Record<string, unknown> = {};
  for (const key of ["paper_size", "orientation", "margins_mm", "printer_name"] as const) {
    if (stored[key] !== undefined) out[key] = stored[key];
  }
  return out;
}

/** Validasi payload; field cloud → 403, nilai tidak sah → 400. */
function validate(payload: Record<string, unknown>): SettingsShape {
  const foreign = foreignKeys(payload);
  if (foreign.length > 0) {
    throw new HttpError(
      `Field ini milik cloud dan tidak bisa diubah dari booth: ${foreign.join(", ")}.`,
      403,
      FIELD_NOT_DEVICE_OWNED
    );
  }
  const parsed = deviceSettingsSchema.safeParse(payload);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new HttpError(
      `${issue?.path.join(".") || "settings"}: ${issue?.message ?? "tidak valid"}`,
      400,
      INVALID_SETTINGS
    );
  }
  return parsed.data as SettingsShape;
}

/** Field yang tidak boleh keluar dari mesin: PIN darurat + rate-limit lokal. */
function stripSecrets(value: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (key.startsWith("exit_pin_") || key === "exit_pin") continue;
    out[key] =
      item && typeof item === "object" && !Array.isArray(item)
        ? stripSecrets(item as Record<string, unknown>)
        : item;
  }
  return out;
}

function present(db: DatabaseSync, config: RuntimeConfig) {
  const active = activeSettings(db, config);
  // Sabuk kedua: baris lama di store bisa memuat kunci PIN; rute ini tidak
  // boleh menjadi jalan keluarnya.
  return {
    ok: true,
    photobox_slug: getMeta(db, "photobox_slug"),
    business_slug: getMeta(db, "business_slug"),
    settings: {
      camera_settings: stripSecrets(active.camera_settings ?? {}),
      print_settings: stripSecrets(active.print_settings ?? {}),
      session_settings: stripSecrets(active.session_settings ?? {}),
    },
  };
}

/** GET /v1/settings */
export function readSettings(ctx: SettingsContext) {
  return { status: 200, body: present(ctx.db, ctx.config) };
}

/**
 * PUT /v1/settings — PUT parsial: grup yang tidak dikirim tidak diubah, dan
 * field di dalam grup digabung dengan nilai tersimpan supaya validasi silang
 * (`warning_seconds < timer_seconds`) tetap bisa diperiksa.
 */
export function writeSettings(ctx: SettingsContext, raw: unknown) {
  const incoming = validate(asObject(raw, "Payload"));
  for (const group of DEVICE_GROUPS) {
    const patch = incoming[group];
    if (!patch) continue;
    const merged = { ...(storedGroup(ctx.db, group) ?? {}), ...patch };
    const check = deviceSettingsSchema.shape[group].safeParse(merged);
    if (!check.success) {
      const issue = check.error.issues[0];
      throw new HttpError(
        `${group}.${issue?.path.join(".") || "settings"}: ${issue?.message ?? "tidak valid"}`,
        400,
        INVALID_SETTINGS
      );
    }
    setSetting(ctx.db, group, check.data);
  }
  return { status: 200, body: present(ctx.db, ctx.config) };
}

/** GET /v1/settings/export — tanpa `exit_pin` / PIN darurat. */
export function exportSettings(ctx: SettingsContext) {
  const settings = stripSecrets(readDeviceSettings(ctx.db));
  return {
    status: 200,
    body: {
      schema_version: SETTINGS_SCHEMA_VERSION,
      exported_at: new Date(ctx.now?.() ?? Date.now()).toISOString(),
      photobox_slug: getMeta(ctx.db, "photobox_slug"),
      business_slug: getMeta(ctx.db, "business_slug"),
      settings,
    },
  };
}

/**
 * POST /v1/settings/import
 *
 * Dua penolakan yang menjaga booth tidak tertukar: versi lebih baru (bentuk
 * yang belum dikenal) dan `photobox_slug` berbeda (setelan booth A masuk ke B).
 */
export function importSettings(ctx: SettingsContext, raw: unknown) {
  const payload = asObject(raw, "Berkas setelan");

  const version = Number(payload.schema_version);
  if (!Number.isInteger(version) || version < 1) {
    throw new HttpError(
      "schema_version wajib bilangan bulat positif.",
      400,
      INVALID_SETTINGS
    );
  }
  if (version > SETTINGS_SCHEMA_VERSION) {
    throw new HttpError(
      `Versi setelan ${version} lebih baru dari yang didukung (${SETTINGS_SCHEMA_VERSION}). ` +
        "Perbarui aplikasi booth lebih dulu.",
      400,
      SCHEMA_VERSION_TOO_NEW
    );
  }

  const currentSlug = getMeta(ctx.db, "photobox_slug");
  const incomingSlug = typeof payload.photobox_slug === "string" ? payload.photobox_slug.trim() : "";
  if (currentSlug && incomingSlug && incomingSlug !== currentSlug) {
    throw new HttpError(
      `Berkas ini milik booth "${incomingSlug}", bukan "${currentSlug}".`,
      409,
      PHOTOBOX_MISMATCH
    );
  }

  const settings = validate(asObject(payload.settings, "settings"));
  for (const group of DEVICE_GROUPS) {
    const value = settings[group];
    if (value) setSetting(ctx.db, group, value);
  }
  return { status: 200, body: present(ctx.db, ctx.config) };
}

/** Router `/v1/settings*`. `null` = bukan rute ini. */
export function handleSettingsRoute(
  ctx: SettingsContext,
  method: string,
  pathname: string,
  readBody: () => Promise<unknown>
): Promise<RouteResult> {
  if (pathname === "/v1/settings") {
    if (method === "GET") return Promise.resolve(readSettings(ctx));
    if (method === "PUT") return readBody().then((body) => writeSettings(ctx, body));
    return Promise.resolve(null);
  }
  if (pathname === "/v1/settings/export" && method === "GET") {
    return Promise.resolve(exportSettings(ctx));
  }
  if (pathname === "/v1/settings/import" && method === "POST") {
    return readBody().then((body) => importSettings(ctx, body));
  }
  return Promise.resolve(null);
}
