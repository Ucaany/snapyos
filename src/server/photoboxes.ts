/**
 * Photobox CRUD + tenant isolation + plan limit — docs/04 §4.6, docs/08 §8.5.
 * Slug unik per business (URL publik /p/[businessSlug]/[photoboxSlug]).
 * Permission: OWNER, MANAGER (docs/04 §4.6).
 */

import "server-only";
import { createServerClient } from "@/lib/supabase/server";
import { invalidatePublicConfig } from "@/server/public-config";
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
  brandingContrastIssues,
  type PhotoboxCreateInput,
  type PhotoboxUpdateInput,
  type BrandingInput,
} from "@/lib/validators";
import {
  brandingColorsChanged,
  foreignBrandAssetKeys,
  mergeBranding,
  resolveBoothOverride,
} from "@/lib/branding-merge";
import { removeResolvedOutcome } from "@/server/storage";
import { accountStorageSub } from "@/server/storage-usage";

const BRAND_ASSETS_BUCKET = "business-assets" as const;

/** Semua key aset branding yang dirujuk sebuah override booth. */
function boothBrandingKeys(branding: unknown): string[] {
  if (!branding || typeof branding !== "object") return [];
  const row = branding as {
    logo_key?: unknown;
    kiosk?: { video_key?: unknown; pages?: Record<string, { video_key?: unknown }> };
  };
  const keys: string[] = [];
  if (typeof row.logo_key === "string" && row.logo_key) keys.push(row.logo_key);
  if (typeof row.kiosk?.video_key === "string" && row.kiosk.video_key) {
    keys.push(row.kiosk.video_key);
  }
  for (const page of Object.values(row.kiosk?.pages ?? {})) {
    if (typeof page?.video_key === "string" && page.video_key) keys.push(page.video_key);
  }
  return keys;
}

/**
 * Hapus blob logo/video booth yang sudah tidak dirujuk (reset ke inherit atau
 * booth dihapus) + kurangi hitungan storage. Fail-open: kegagalan cleanup tidak
 * membatalkan operasi utama.
 */
async function purgeBrandBlobs(businessId: string, keys: string[]) {
  if (keys.length === 0) return;
  try {
    const { ok } = await removeResolvedOutcome(BRAND_ASSETS_BUCKET, keys);
    if (ok.length > 0) await accountStorageSub(businessId, ok);
  } catch {
    /* cleanup gagal — blob basi dipungut job lifecycle */
  }
}

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

function assertSlug(slug: string) {
  if (slug.length < 3 || slug.length > 48 || !SLUG_PATTERN.test(slug)) {
    throw new ApiError(
      "VALIDATION_ERROR",
      "Slug tidak valid (3–48, huruf kecil/angka/tanda hubung)",
      {
        slug: ["Slug hanya boleh huruf kecil, angka, dan tanda hubung"],
      }
    );
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

export async function listPhotoboxes(userId: string, businessId: string): Promise<PhotoboxRow[]> {
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
  const rows = (data ?? []) as unknown as (Omit<
    PhotoboxRow,
    "outlet_name" | "has_exit_pin" | "has_legacy_exit_pin"
  > & {
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
    outlet_name: row.outlets && !Array.isArray(row.outlets) ? (row.outlets.name as string) : null,
    device_status: row.device_status,
    has_exit_pin: Boolean(row.exit_pin_hash),
    has_legacy_exit_pin: Boolean(row.exit_pin_hash) && !row.exit_pin_hash!.startsWith("$argon2"),
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

  const exitPinHash = exitPin !== undefined ? await hashDevicePin(exitPin) : null;
  const mergedCameraSettings = { ...(cameraSettings ?? {}) };

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
      exit_pin_hash: exitPinHash,
      camera_settings: mergedCameraSettings,
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
    // Merge per-key, bukan replace. Owner boleh menulis `copies`/`layout`
    // (milik cloud); laporan device tidak — penyaringan itu ada di
    // `mergeDeviceSettings` yang dipakai PATCH devices/settings.
    if (cameraSettings !== undefined) {
      (columns as Record<string, unknown>).camera_settings = {
        ...((current.camera_settings as CameraSettings | null) ?? {}),
        ...cameraSettings,
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
    .eq("business_id", businessId) // tenant scope: lintas tenant = 0 row → 404
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw new ApiError("INTERNAL", "Gagal memperbarui photobox");
  if (!data) throw new ApiError("NOT_FOUND", "Photobox tidak ditemukan");
  invalidatePublicConfig(businessId);
  return data;
}

export async function deletePhotobox(userId: string, businessId: string, photoboxId: string) {
  await requireMembership(userId, businessId, "photobox:write");

  const supabase = createServerClient();
  // Baca override dulu: setelah baris dihapus, key aset tidak bisa diturunkan.
  const { data: existing } = await supabase
    .from("photoboxes")
    .select("branding")
    .eq("id", photoboxId)
    .eq("business_id", businessId)
    .maybeSingle();

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
  await purgeBrandBlobs(businessId, boothBrandingKeys(existing?.branding));
}

// --- PER-BOOTH BRANDING OVERRIDE (0045) ---

/**
 * Simpan branding override per-booth.
 *
 * `mode = "merge"` (default, kompatibel) menempelkan input di atas override
 * lama; `mode = "replace"` (dipakai Design Builder) memakai objek apa adanya —
 * field yang tidak dikirim berarti inherit global. `null`/`{}` = reset
 * (kolom branding = null).
 *
 * Kontras divalidasi pada branding EFEKTIF (global + override), bukan hanya
 * nilai override: override yang menurunkan kontras terhadap global tetap ditolak.
 */
export async function updatePhotoboxBranding(
  userId: string,
  businessId: string,
  photoboxId: string,
  input: BrandingInput | null,
  mode: "merge" | "replace" = "merge"
): Promise<BrandingConfig | null> {
  await requireMembership(userId, businessId, "photobox:write");
  const parsed = input ? brandingSchema.parse(input) : null;
  if (parsed && foreignBrandAssetKeys(businessId, parsed).length > 0) {
    throw new ApiError("VALIDATION_ERROR", "Aset branding tidak valid.", {
      logo: ["Aset harus diunggah lewat halaman ini"],
      kiosk: ["Aset harus diunggah lewat halaman ini"],
    });
  }

  const supabase = createServerClient();
  const { data: current, error: readErr } = await supabase
    .from("photoboxes")
    .select("branding")
    .eq("id", photoboxId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (readErr) throw new ApiError("INTERNAL", "Gagal memuat branding booth");
  if (!current) throw new ApiError("NOT_FOUND", "Photobox tidak ditemukan");

  const existing = current.branding ? brandingSchema.safeParse(current.branding) : null;
  const existingBranding = existing?.success ? existing.data : null;
  const merged = resolveBoothOverride(existingBranding, parsed, mode);

  if (merged) {
    const { data: settings } = await supabase
      .from("business_settings")
      .select("branding")
      .eq("business_id", businessId)
      .maybeSingle();
    const globalBranding = brandingSchema.catch({}).parse(settings?.branding ?? {});
    const effective = mergeBranding(globalBranding, merged);
    // Hanya validasi bila warna berubah: unggah logo/video tidak boleh ditolak
    // oleh kontras lama yang sudah tersimpan.
    const previous = mergeBranding(globalBranding, existingBranding);
    const issues = brandingColorsChanged(previous, effective)
      ? brandingContrastIssues(
          effective as {
            kiosk?: {
              bg_color?: string;
              text_color?: string;
              pages?: Record<string, { bg_color?: string; text_color?: string } | undefined>;
            };
          }
        )
      : [];
    if (issues.length > 0) {
      const details: Record<string, string[]> = {};
      for (const issue of issues) {
        (details[issue.path.join(".")] ??= []).push(issue.message);
        (details[issue.path[0] ?? "kiosk"] ??= []).push(issue.message);
      }
      throw new ApiError(
        "VALIDATION_ERROR",
        "Kontras warna belum memenuhi standar WCAG AA.",
        details
      );
    }
  }

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
  // Override yang di-reset/field yang dihapus tidak lagi merujuk blob lamanya —
  // bersihkan setelah tulis sukses, bukan sebelum (data lama masih dipakai
  // kiosk kalau penulisan gagal).
  const nextKeys = boothBrandingKeys(merged);
  await purgeBrandBlobs(
    businessId,
    boothBrandingKeys(existingBranding).filter((key) => !nextKeys.includes(key))
  );
  return (data.branding as BrandingConfig | null) ?? null;
}
