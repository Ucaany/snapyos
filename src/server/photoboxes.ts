/**
 * Photobox CRUD + tenant isolation + plan limit — docs/04 §4.6, docs/08 §8.5.
 * Slug unik per business (URL publik /p/[businessSlug]/[photoboxSlug]).
 * Permission: OWNER, MANAGER (docs/04 §4.6).
 */

import "server-only";
import { updateTag } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { publicConfigCacheTag } from "@/server/public-config";
import { ApiError } from "@/lib/api-errors";
import { can, type Permission } from "@/lib/rbac";
import { getMembership } from "@/lib/tenant";
import { isPlanLimitError, requirePlanLimits } from "@/server/plan-limits";
import { hashDevicePin } from "@/lib/device-token";
import type { CameraSettings, PrintSettings, SessionSettings } from "@/lib/kiosk-types";
import type { BrandingConfig } from "@/lib/kiosk-types";
import { SLUG_PATTERN, slugify } from "@/lib/slug";
import { listAssignedPhotoboxIds } from "@/server/staff";
import {
  photoboxCreateSchema,
  photoboxUpdateSchema,
  brandingSchema,
  type PhotoboxCreateInput,
  type PhotoboxUpdateInput,
  type BrandingInput,
} from "@/lib/validators";

export type PhotoboxRow = {
  id: string;
  slug: string;
  name: string;
  status: string;
  camera: string | null;
  printer: string | null;
  display: string | null;
  outlet_id: string;
  outlet_name: string | null;
  device_status: Record<string, unknown> | null;
  has_exit_pin: boolean;
  /** True bila hash bukan argon2 (sha256 legacy) — owner harus set ulang PIN. */
  has_legacy_exit_pin: boolean;
  chroma_key_enabled: boolean;
  camera_settings: CameraSettings;
  print_settings: PrintSettings;
  session_settings: SessionSettings;
  branding: BrandingConfig | null;
  /** Saluran pembayaran per-booth (null = gateway + voucher). */
  payment_mode: "gateway" | "voucher" | null;
  created_at: string;
};

const COLUMNS =
  "id, slug, name, status, camera, printer, display, outlet_id, device_status, exit_pin_hash, camera_settings, print_settings, session_settings, branding, payment_mode, created_at";

async function requireMembership(userId: string, businessId: string, permission: Permission) {
  const membership = await getMembership(userId, businessId);
  if (!membership) throw new ApiError("NOT_FOUND", "Business tidak ditemukan");
  if (!can(membership.role, permission)) {
    throw new ApiError("FORBIDDEN", "Anda tidak punya izin untuk aksi ini");
  }
  return membership;
}

/**
 * Invalidate data-cache public config (kiosk runtime) setelah mutasi photobox.
 * getPublicConfig di-cache 30s (public-config.ts); tanpa ini, perubahan
 * print/camera/session settings baru tampil di kiosk setelah TTL lewat
 * (bukan read-your-writes). updateTag = invalidasi segera (Next 16).
 */
function invalidatePublicConfig(businessId: string) {
  updateTag(publicConfigCacheTag(businessId));
}

function assertSlug(slug: string) {
  if (slug.length < 3 || slug.length > 48 || !SLUG_PATTERN.test(slug)) {
    throw new ApiError("VALIDATION_ERROR", "Slug tidak valid (3–48, huruf kecil/angka/tanda hubung)", {
      slug: ["Slug hanya boleh huruf kecil, angka, dan tanda hubung"],
    });
  }
}

/** Outlet harus milik business (anti cross-tenant via outlet_id asing). */
async function assertOutletOwned(businessId: string, outletId: string) {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("outlets")
    .select("id, name")
    .eq("id", outletId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (!data) throw new ApiError("VALIDATION_ERROR", "Outlet tidak ditemukan di business ini");
  return data;
}

export async function listPhotoboxes(
  userId: string,
  businessId: string
): Promise<PhotoboxRow[]> {
  const membership = await requireMembership(userId, businessId, "photobox:read");

  const supabase = createServerClient();

  // Akses booth per member (0018): staff hanya melihat booth yang di-assign
  // owner; owner/manager melihat semua.
  let photoboxFilter: string[] | null = null;
  if (membership.role === "staff") {
    photoboxFilter = (await listAssignedPhotoboxIds(userId, businessId)) ?? [];
    if (photoboxFilter.length === 0) return [];
  }

  let req = supabase
    .from("photoboxes")
    .select(`${COLUMNS}, outlets ( name )`)
    .eq("business_id", businessId);
  if (photoboxFilter) req = req.in("id", photoboxFilter);
  const { data, error } = await req.order("created_at", { ascending: true });

  if (error) throw new ApiError("INTERNAL", "Gagal memuat photobox");
  const rows = (data ?? []) as unknown as (Omit<PhotoboxRow, "outlet_name" | "has_exit_pin" | "has_legacy_exit_pin"> & {
    exit_pin_hash: string | null;
    outlets: { name: string } | { name: string }[] | null;
  })[];
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    status: row.status,
    camera: row.camera,
    printer: row.printer,
    display: row.display,
    outlet_id: row.outlet_id,
    outlet_name:
      row.outlets && !Array.isArray(row.outlets) ? (row.outlets.name as string) : null,
    device_status: row.device_status,
    has_exit_pin: Boolean(row.exit_pin_hash),
    has_legacy_exit_pin: Boolean(row.exit_pin_hash) && !row.exit_pin_hash!.startsWith("$argon2"),
    chroma_key_enabled: Boolean((row as { camera_settings?: CameraSettings | null }).camera_settings?.chroma_key_enabled),
    camera_settings: (row.camera_settings as CameraSettings | null) ?? {},
    print_settings: (row.print_settings as PrintSettings | null) ?? {},
    session_settings: (row.session_settings as SessionSettings | null) ?? {},
    branding: (row.branding as BrandingConfig | null) ?? null,
    payment_mode: (row as { payment_mode?: "gateway" | "voucher" | null }).payment_mode ?? null,
    created_at: row.created_at,
  }));
}

export async function createPhotobox(
  userId: string,
  businessId: string,
  input: PhotoboxCreateInput
) {
  const parsed = photoboxCreateSchema.parse(input);
  await requireMembership(userId, businessId, "photobox:write");

  const {
    chroma_key_enabled: chromaKeyEnabled,
    camera_settings: cameraSettings,
    exit_pin: exitPin,
    ...photoboxColumns
  } = parsed;
  const slug = parsed.slug ?? slugify(parsed.name);
  assertSlug(slug);
  await assertOutletOwned(businessId, parsed.outlet_id);

  const supabase = createServerClient();
  const limits = await requirePlanLimits(businessId);

  // Slug unik per business (unique constraint business_id + slug).
  const { data: dupe } = await supabase
    .from("photoboxes")
    .select("id")
    .eq("business_id", businessId)
    .eq("slug", slug)
    .maybeSingle();
  if (dupe) {
    throw new ApiError("VALIDATION_ERROR", "Slug sudah dipakai photobox lain di business ini", {
      slug: ["Slug sudah dipakai"],
    });
  }

  // Kuota + insert atomik (0069) — cegah race count-then-insert.
  const { data, error } = await supabase.rpc("create_photobox_with_quota", {
    p_business_id: businessId,
    p_max_photoboxes: limits.max_photoboxes,
    p_payload: {
      outlet_id: parsed.outlet_id,
      slug,
      name: photoboxColumns.name,
      status: photoboxColumns.status ?? null,
      camera: photoboxColumns.camera ?? null,
      printer: photoboxColumns.printer ?? null,
      display: photoboxColumns.display ?? null,
      payment_mode: photoboxColumns.payment_mode ?? null,
      exit_pin_hash: exitPin !== undefined ? await hashDevicePin(exitPin) : null,
      camera_settings: {
        ...(cameraSettings ?? {}),
        chroma_key_enabled: chromaKeyEnabled ?? cameraSettings?.chroma_key_enabled ?? false,
      },
      print_settings: photoboxColumns.print_settings ?? null,
      session_settings: photoboxColumns.session_settings ?? null,
    },
  });
  if (error) {
    if (isPlanLimitError(error)) {
      throw new ApiError(
        "PLAN_LIMIT_REACHED",
        `Plan Anda dibatasi ${limits.max_photoboxes} photobox. Upgrade untuk menambah.`
      );
    }
    throw new ApiError("INTERNAL", "Gagal membuat photobox");
  }
  invalidatePublicConfig(businessId);
  return data;
}

export async function updatePhotobox(
  userId: string,
  businessId: string,
  photoboxId: string,
  input: PhotoboxUpdateInput
) {
  const parsed = photoboxUpdateSchema.parse(input);
  await requireMembership(userId, businessId, "photobox:write");

  // exit_pin bukan kolom — dipetakan ke exit_pin_hash (argon2id, docs/05 §5.0).
  const {
    exit_pin: exitPin,
    chroma_key_enabled: chromaKeyEnabled,
    camera_settings: cameraSettings,
    print_settings: printSettings,
    session_settings: sessionSettings,
    ...columns
  } = parsed;

  const supabase = createServerClient();

  if (parsed.slug !== undefined) {
    assertSlug(parsed.slug);
    const { data: dupe } = await supabase
      .from("photoboxes")
      .select("id")
      .eq("business_id", businessId)
      .eq("slug", parsed.slug)
      .neq("id", photoboxId)
      .maybeSingle();
    if (dupe) {
      throw new ApiError("VALIDATION_ERROR", "Slug sudah dipakai photobox lain di business ini", {
        slug: ["Slug sudah dipakai"],
      });
    }
  }
  if (parsed.outlet_id !== undefined) {
    await assertOutletOwned(businessId, parsed.outlet_id);
  }

  if (
    chromaKeyEnabled !== undefined ||
    cameraSettings !== undefined ||
    printSettings !== undefined ||
    sessionSettings !== undefined
  ) {
    const { data: current } = await supabase
      .from("photoboxes")
      .select("camera_settings, print_settings, session_settings")
      .eq("id", photoboxId)
      .eq("business_id", businessId)
      .maybeSingle();
    if (!current) throw new ApiError("NOT_FOUND", "Photobox tidak ditemukan");
    if (chromaKeyEnabled !== undefined || cameraSettings !== undefined) {
      (columns as Record<string, unknown>).camera_settings = {
        ...((current.camera_settings as CameraSettings | null) ?? {}),
        ...(cameraSettings ?? {}),
        ...(chromaKeyEnabled !== undefined ? { chroma_key_enabled: chromaKeyEnabled } : {}),
      };
    }
    if (printSettings !== undefined) {
      (columns as Record<string, unknown>).print_settings = {
        ...((current.print_settings as PrintSettings | null) ?? {}),
        ...printSettings,
      };
    }
    if (sessionSettings !== undefined) {
      (columns as Record<string, unknown>).session_settings = {
        ...((current.session_settings as SessionSettings | null) ?? {}),
        ...sessionSettings,
      };
    }
  }

  // Argon2 hash awaited di sini agar update-object berisi hash final; reset
  // counter throttle juga saat PIN diganti (attempt lama tidak lagi relevan).
  const exitPinPatch =
    exitPin !== undefined
      ? {
          exit_pin_hash: await hashDevicePin(exitPin),
          exit_pin_failed_count: 0,
          exit_pin_locked_until: null,
        }
      : {};

  const { data, error } = await supabase
    .from("photoboxes")
    .update({
      ...columns,
      ...exitPinPatch,
    })
    .eq("id", photoboxId)
    .eq("business_id", businessId) // tenant scope — lintas tenant = 0 row → 404
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw new ApiError("INTERNAL", "Gagal memperbarui photobox");
  if (!data) throw new ApiError("NOT_FOUND", "Photobox tidak ditemukan");
  invalidatePublicConfig(businessId);
  return data;
}

export async function deletePhotobox(
  userId: string,
  businessId: string,
  photoboxId: string
) {
  await requireMembership(userId, businessId, "photobox:write");

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("photoboxes")
    .delete()
    .eq("id", photoboxId)
    .eq("business_id", businessId)
    .select("id")
    .maybeSingle();
  if (error) throw new ApiError("INTERNAL", "Gagal menghapus photobox");
  if (!data) throw new ApiError("NOT_FOUND", "Photobox tidak ditemukan");
  invalidatePublicConfig(businessId);
}

export type PhotoboxCameraConfig = {
  id: string;
  name: string;
  slug: string;
  camera_settings: CameraSettings;
};

/** Baca camera_settings photobox — dipakai owner camera-test (docs/05 §5.5). */
export async function getPhotoboxCameraConfig(
  userId: string,
  businessId: string,
  photoboxId: string
): Promise<PhotoboxCameraConfig> {
  await requireMembership(userId, businessId, "photobox:read");

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("photoboxes")
    .select("id, name, slug, camera_settings")
    .eq("id", photoboxId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) throw new ApiError("INTERNAL", "Gagal memuat konfigurasi kamera");
  if (!data) throw new ApiError("NOT_FOUND", "Photobox tidak ditemukan");
  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    camera_settings: (data.camera_settings as CameraSettings | null) ?? {},
  };
}

/** Patch camera_settings (merge, tidak menimpa field device-reported).
 *  Dipakai owner camera-test untuk persist mirror_preview (docs/05 §5.5.1). */
export async function updatePhotoboxCameraConfig(
  userId: string,
  businessId: string,
  photoboxId: string,
  patch: Partial<CameraSettings>
): Promise<CameraSettings> {
  await requireMembership(userId, businessId, "photobox:write");

  const supabase = createServerClient();
  // Read-merge-write: camera_settings jsonb berisi field device-reported
  // (preferred_device_id, capture_width, dll) — merge agar tidak hilang.
  const { data: cur, error: readErr } = await supabase
    .from("photoboxes")
    .select("camera_settings")
    .eq("id", photoboxId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (readErr) throw new ApiError("INTERNAL", "Gagal memuat konfigurasi kamera");
  if (!cur) throw new ApiError("NOT_FOUND", "Photobox tidak ditemukan");

  const merged: CameraSettings = {
    ...((cur.camera_settings as CameraSettings | null) ?? {}),
    ...patch,
  };
  const { data, error } = await supabase
    .from("photoboxes")
    .update({ camera_settings: merged })
    .eq("id", photoboxId)
    .eq("business_id", businessId) // tenant scope: lintas tenant = 0 row → 404
    .select("camera_settings")
    .maybeSingle();
  if (error) throw new ApiError("INTERNAL", "Gagal menyimpan konfigurasi kamera");
  if (!data) throw new ApiError("NOT_FOUND", "Photobox tidak ditemukan");
  invalidatePublicConfig(businessId);
  return (data.camera_settings as CameraSettings | null) ?? {};
}

// --- PER-BOOTH BRANDING OVERRIDE (0045) ---

export type PhotoboxBranding = {
  id: string;
  name: string;
  slug: string;
  /** null = inherit global business_settings.branding. */
  branding: BrandingConfig | null;
};

/** Baca branding per-booth (untuk editor inherit/override di dashboard). */
export async function getPhotoboxBranding(
  userId: string,
  businessId: string,
  photoboxId: string
): Promise<PhotoboxBranding> {
  await requireMembership(userId, businessId, "photobox:read");

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("photoboxes")
    .select("id, name, slug, branding")
    .eq("id", photoboxId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) throw new ApiError("INTERNAL", "Gagal memuat branding booth");
  if (!data) throw new ApiError("NOT_FOUND", "Photobox tidak ditemukan");
  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    branding: (data.branding as BrandingConfig | null) ?? null,
  };
}

/**
 * Simpan branding override per-booth. Deep-merge dengan override lama agar
 * update parsial tidak menghapus field lain; input `null`/`{}` = reset ke
 * inherit (set kolom branding = null).
 */
export async function updatePhotoboxBranding(
  userId: string,
  businessId: string,
  photoboxId: string,
  input: BrandingInput | null
): Promise<BrandingConfig | null> {
  await requireMembership(userId, businessId, "photobox:write");
  const parsed = input ? brandingSchema.parse(input) : null;

  const supabase = createServerClient();
  const { data: current, error: readErr } = await supabase
    .from("photoboxes")
    .select("branding")
    .eq("id", photoboxId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (readErr) throw new ApiError("INTERNAL", "Gagal memuat branding booth");
  if (!current) throw new ApiError("NOT_FOUND", "Photobox tidak ditemukan");

  // Reset ke inherit → kolom null. Sebaliknya deep-merge ke override lama
  // (termasuk per-layar, agar update parsial tidak menghapus field halaman sama).
  const hasOverride = parsed && Object.keys(parsed).length > 0;
  const existing = current.branding ? brandingSchema.safeParse(current.branding) : null;
  const existingBranding = existing?.success ? existing.data : null;
  const existingPages = (existingBranding?.kiosk?.pages ?? {}) as Record<string, Record<string, unknown>>;
  const parsedPages = (parsed?.kiosk?.pages ?? {}) as Record<string, Record<string, unknown>>;
  const mergedPages: Record<string, Record<string, unknown>> = { ...existingPages };
  for (const key of Object.keys(parsedPages)) {
    mergedPages[key] = { ...(existingPages[key] ?? {}), ...(parsedPages[key] ?? {}) };
  }
  const merged = hasOverride
    ? brandingSchema.parse({
        ...(existingBranding ?? {}),
        ...parsed,
        kiosk: {
          ...(existingBranding?.kiosk ?? {}),
          ...(parsed?.kiosk ?? {}),
          pages: mergedPages,
        },
      })
    : null;

  const { data, error } = await supabase
    .from("photoboxes")
    .update({ branding: merged })
    .eq("id", photoboxId)
    .eq("business_id", businessId)
    .select("branding")
    .maybeSingle();
  if (error) throw new ApiError("INTERNAL", "Gagal menyimpan branding booth");
  if (!data) throw new ApiError("NOT_FOUND", "Photobox tidak ditemukan");
  invalidatePublicConfig(businessId);
  return (data.branding as BrandingConfig | null) ?? null;
}
