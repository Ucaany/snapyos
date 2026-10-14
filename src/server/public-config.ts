/**
 * Public config kiosk — docs/05 §5.2–5.4, docs/08 §8.14.
 * Tanpa login; resolve business + photobox via slug. Data hanya yang aktif.
 */

import "server-only";
import { unstable_cache } from "next/cache";
import { createHash } from "node:crypto";
import { createServerClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/api-errors";
import { brandingSchema, type BrandingInput } from "@/lib/validators";
import { slotCount, type TemplateLayout } from "@/lib/template-layout";
import type {
  BrandingConfig,
  KioskPageConfig,
  PublicConfig,
  PublicPackage,
  PublicTemplate,
} from "@/lib/kiosk-types";
import { SIGNED_URL_TTL_SECONDS as SIGNED_URL_TTL } from "@/lib/constants";
import { signedUrlMap } from "@/server/storage";

const BRAND_ASSETS_BUCKET = "business-assets" as const;

/** Tag data-cache public config (dipakai mutasi branding untuk updateTag). */
export const publicConfigCacheTag = (businessId: string) => `business:${businessId}:public-config`;

/** Cache 30 detik — poll kiosk 3s terlayani dari cache kecuali ada mutasi
 *  (updateTag dari updateBranding) atau TTL lewat. Presign R2 tak dijalan
 *  ulang tiap poll; ETag tetap dihitung dari payload ter-cache. */
const PUBLIC_CONFIG_TTL_SECONDS = 30;

/** Batch signed URL untuk banyak key — hindari N+1 saat render per-screen video. */
async function signedUrls(keys: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = Array.from(new Set(keys.filter((k): k is string => Boolean(k))));
  return signedUrlMap(BRAND_ASSETS_BUCKET, unique, SIGNED_URL_TTL);
}

async function resolveBusinessBySlug(slug: string) {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("businesses")
    .select("id, name, slug, status")
    .eq("slug", slug)
    .maybeSingle();
  if (!data) throw new ApiError("NOT_FOUND", "Business tidak ditemukan");
  return data;
}

/** Resolve business + photobox via slug (dipakai route packages/config). */
export async function resolveBusinessAndPhotobox(businessSlug: string, photoboxSlug: string) {
  const business = await resolveBusinessBySlug(businessSlug);
  const photobox = await resolvePhotoboxBySlug(business.id, photoboxSlug);
  return { business, photobox };
}

export async function resolveBusinessIdBySlug(businessSlug: string): Promise<string> {
  const business = await resolveBusinessBySlug(businessSlug);
  return business.id;
}

async function resolvePhotoboxBySlug(businessId: string, slug: string) {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("photoboxes")
    .select(
      "id, slug, name, status, outlet_id, camera_settings, print_settings, session_settings, device_status, branding"
    )
    .eq("business_id", businessId)
    .eq("slug", slug)
    .maybeSingle();
  if (!data) throw new ApiError("NOT_FOUND", "Photobox tidak ditemukan");
  return data;
}

export async function getPublicConfig(businessSlug: string, photoboxSlug: string): Promise<PublicConfig> {
  const business = await resolveBusinessBySlug(businessSlug);
  // Cache per business+photobox (tag business:<id>:public-config). Mutasi
  // branding memanggil updateTag → entri basi dibuang, poll berikutnya segar.
  const config = await unstable_cache(
    () => buildPublicConfig(business, photoboxSlug),
    ["public-config", business.id, photoboxSlug],
    { tags: [publicConfigCacheTag(business.id)], revalidate: PUBLIC_CONFIG_TTL_SECONDS }
  )();
  return { ...config, etag: etagOf(config) };
}

/** Hash ETag dari konten stabil (tanpa signed URL yang berubah tiap presign). */
function etagOf(config: Omit<PublicConfig, "etag">): string {
  const stable = JSON.stringify({
    business: config.business,
    branding: config.branding,
    photobox: config.photobox,
    packages: config.packages,
    checkout: config.checkout,
  });
  return createHash("sha1").update(stable).digest("hex");
}

async function buildPublicConfig(
  business: Awaited<ReturnType<typeof resolveBusinessBySlug>>,
  photoboxSlug: string
): Promise<Omit<PublicConfig, "etag">> {
  const photobox = await resolvePhotoboxBySlug(business.id, photoboxSlug);

  const supabase = createServerClient();
  const { data: settings } = await supabase
    .from("business_settings")
    .select("branding, checkout")
    .eq("business_id", business.id)
    .maybeSingle();

  const globalBranding = brandingSchema.catch({}).parse(settings?.branding ?? {});
  // Per-booth override (0045): null = inherit global; non-null = deep-merge.
  const rawOverride = (photobox as { branding?: unknown }).branding;
  const boothOverride = rawOverride ? brandingSchema.safeParse(rawOverride) : null;
  const booth = boothOverride?.success ? boothOverride.data : null;

  // Deep-merge override di atas global (field override menang; pages per-layar).
  const gKiosk = globalBranding.kiosk ?? {};
  const oKiosk = booth?.kiosk ?? {};
  const merged: BrandingInput = {
    ...globalBranding,
    ...(booth ?? {}),
    kiosk: {
      ...gKiosk,
      ...oKiosk,
      pages: { ...(gKiosk.pages ?? {}), ...(oKiosk.pages ?? {}) },
    },
  };

  // Signed URL untuk logo + video global + video per-layar (batch, anti N+1).
  const pageVideoKeys = Object.values(merged.kiosk?.pages ?? {})
    .map((p) => p?.video_key)
    .filter((k): k is string => Boolean(k));
  const videoKeys = [merged.logo_key, merged.kiosk?.video_key, ...pageVideoKeys];
  const urlMap = await signedUrls(videoKeys);

  const logoUrl = merged.logo_key ? (urlMap.get(merged.logo_key) ?? null) : null;
  const videoUrl = merged.kiosk?.video_key ? (urlMap.get(merged.kiosk.video_key) ?? null) : null;

  // Convert pages (storage video_key → signed video_url) ke bentuk client.
  const rawPages = merged.kiosk?.pages ?? {};
  const pages: BrandingConfig["kiosk"] extends { pages?: infer P } ? P : never = {} as never;
  for (const key of Object.keys(rawPages)) {
    const page = rawPages[key as keyof typeof rawPages];
    const signed = page?.video_key ? (urlMap.get(page.video_key) ?? null) : null;
    (pages as Record<string, KioskPageConfig>)[key] = {
      bg_color: page?.bg_color,
      text_color: page?.text_color,
      font_scale: page?.font_scale,
      button_radius: page?.button_radius,
      padding: page?.padding,
      align: page?.align,
      video_url: signed,
    };
  }

  const branding: BrandingConfig = {
    welcome_title: merged.welcome_title,
    welcome_tagline: merged.welcome_tagline,
    welcome_button: merged.welcome_button,
    primary_color: merged.primary_color,
    secondary_color: merged.secondary_color,
    logo_url: logoUrl,
    kiosk: {
      bg_color: merged.kiosk?.bg_color,
      text_color: merged.kiosk?.text_color,
      font_scale: merged.kiosk?.font_scale,
      button_radius: merged.kiosk?.button_radius,
      padding: merged.kiosk?.padding,
      align: merged.kiosk?.align,
      welcome_layout: merged.kiosk?.welcome_layout,
      payment_align: merged.kiosk?.payment_align,
      result_layout: merged.kiosk?.result_layout,
      payment_title: merged.kiosk?.payment_title,
      payment_hint: merged.kiosk?.payment_hint,
      capture_title: merged.kiosk?.capture_title,
      capture_hint: merged.kiosk?.capture_hint,
      editor_title: merged.kiosk?.editor_title,
      editor_hint: merged.kiosk?.editor_hint,
      result_title: merged.kiosk?.result_title,
      result_hint: merged.kiosk?.result_hint,
      guide_title: merged.kiosk?.guide_title,
      guide_button: merged.kiosk?.guide_button,
      package_title: merged.kiosk?.package_title,
      template_title: merged.kiosk?.template_title,
      show_logo: merged.kiosk?.show_logo,
      show_tagline: merged.kiosk?.show_tagline,
      show_mirror_toggle: merged.kiosk?.show_mirror_toggle,
      allow_zoom_pan: merged.kiosk?.allow_zoom_pan,
      video_url: videoUrl,
      guide_steps: merged.kiosk?.guide_steps,
      pages,
    },
  };

  const offlineEnabled =
    (settings as { checkout?: { offline_enabled?: boolean } } | null)?.checkout
      ?.offline_enabled === true;

  const packages = await listPublicPackages(business.id, photobox.id, photobox.outlet_id);

  return {
    business: { name: business.name, slug: business.slug, logo_url: logoUrl },
    branding,
    checkout: { offline_enabled: offlineEnabled },
    photobox: {
      id: photobox.id,
      slug: photobox.slug,
      name: photobox.name,
      status: photobox.status,
      camera_settings: (photobox.camera_settings as PublicConfig["photobox"]["camera_settings"]) ?? {},
      print_settings: (photobox.print_settings as PublicConfig["photobox"]["print_settings"]) ?? {},
      session_settings: (photobox.session_settings as PublicConfig["photobox"]["session_settings"]) ?? {},
      device_status: (photobox.device_status as Record<string, unknown>) ?? null,
    },
    packages,
  };
}

/**
 * Package aktif + eligible untuk photobox/outlet (docs/05 §5.3).
 * Package tanpa pembatasan (package_photoboxes/package_outlets kosong) = tersedia semua.
 */
export async function listPublicPackages(
  businessId: string,
  photoboxId: string,
  outletId: string
): Promise<PublicPackage[]> {
  const supabase = createServerClient();

  const [{ data: packages }, { data: pbLinks }, { data: outletLinks }] = await Promise.all([
    supabase
      .from("packages")
      .select("id, name, price, photo_count, print_count, digital_output, capture_mode, description")
      .eq("business_id", businessId)
      .eq("is_active", true)
      .order("price", { ascending: true }),
    supabase.from("package_photoboxes").select("package_id, photobox_id"),
    supabase.from("package_outlets").select("package_id, outlet_id"),
  ]);

  const packageIds = new Set((packages ?? []).map((pkg) => pkg.id));
  const pbRestricted = new Map<string, Set<string>>();
  for (const row of pbLinks ?? []) {
    if (!packageIds.has(row.package_id)) continue;
    const set = pbRestricted.get(row.package_id) ?? new Set<string>();
    set.add(row.photobox_id);
    pbRestricted.set(row.package_id, set);
  }
  const outletRestricted = new Map<string, Set<string>>();
  for (const row of outletLinks ?? []) {
    if (!packageIds.has(row.package_id)) continue;
    const set = outletRestricted.get(row.package_id) ?? new Set<string>();
    set.add(row.outlet_id);
    outletRestricted.set(row.package_id, set);
  }

  return (packages ?? [])
    .filter((pkg) => {
      const pbSet = pbRestricted.get(pkg.id);
      if (pbSet && !pbSet.has(photoboxId)) return false;
      const outletSet = outletRestricted.get(pkg.id);
      if (outletSet && !outletSet.has(outletId)) return false;
      return true;
    })
    .map((pkg) => ({
      id: pkg.id,
      name: pkg.name,
      price: pkg.price,
      photo_count: pkg.photo_count,
      print_count: pkg.print_count,
      digital_output: pkg.digital_output,
      capture_mode: pkg.capture_mode,
      description: pkg.description,
    }));
}

/**
 * Template aktif milik business/global, di-assign ke package (docs/05 §5.4,
 * docs/15 §15.6). Saat packageId diberikan: filter slot_count ==
 * package.photo_count (template legacy slot_count 0 tetap lolos) dan
 * file_url/thumbnail_url dikirim sebagai signed URL (bucket private).
 */
function frameProxyUrl(url: string): string {
  if (!/^https?:\/\//i.test(url)) return url;
  return `/api/v1/public/frame?url=${encodeURIComponent(url)}`;
}

export async function listPublicTemplates(businessId: string, packageId?: string): Promise<PublicTemplate[]> {
  const supabase = createServerClient();
  const query = supabase
    .from("templates")
    .select("id, name, category, file_url, thumbnail_url, layout, is_premium, price")
    .eq("is_active", true)
    .or(`business_id.eq.${businessId},business_id.is.null`);

  const { data: templates } = await query;
  const rows = (templates ?? []) as {
    id: string;
    name: string;
    category: string;
    file_url: string;
    thumbnail_url: string | null;
    layout: unknown;
    is_premium: boolean;
    price: number | null;
  }[];

  // Template global premium hanya tampil bila sudah dibeli business ini.
  const { data: owned } = await supabase
    .from("business_template_purchases")
    .select("template_id")
    .eq("business_id", businessId);
  const ownedIds = new Set(((owned ?? []) as { template_id: string }[]).map((o) => o.template_id));

  const visible = rows.filter((t) => {
    // Milik business sendiri → selalu tampil.
    if (t.is_premium === false && t.price === null) {
      // Template biasa (milik business atau global gratis) → tampil.
      return true;
    }
    // Template global premium (is_premium=true) → wajib dibeli.
    return ownedIds.has(t.id);
  });

  let allowed: Set<string> | null = null;
  let photoCount: number | null = null;
  if (packageId) {
    const [{ data: links }, { data: pkg }] = await Promise.all([
      supabase.from("package_templates").select("template_id").eq("package_id", packageId),
      supabase
        .from("packages")
        .select("photo_count")
        .eq("id", packageId)
        .eq("business_id", businessId)
        .maybeSingle(),
    ]);
    allowed = new Set((links ?? []).map((l) => l.template_id));
    photoCount = pkg?.photo_count ?? null;
  }

  const filtered = visible.filter((t) => {
    if (allowed && !allowed.has(t.id)) return false;
    if (photoCount !== null) {
      // docs/15 §15.6 — filter slot_count == package.photo_count (legacy 0 lolos).
      const sc = slotCount(t.layout);
      if (sc > 0 && sc !== photoCount) return false;
    }
    return true;
  });

  // Batch signed URL — satu request storage untuk seluruh daftar (bukan N+1).
  // ponytail: fallback ke key mentah bila batch gagal — kiosk retry render berikutnya.
  const keys = Array.from(
    new Set(filtered.flatMap((t) => {
      const ks = [t.file_url];
      if (t.thumbnail_url) ks.push(t.thumbnail_url);
      return ks;
    }))
  );
  const urlByKey = await signedUrlMap(BRAND_ASSETS_BUCKET, keys, SIGNED_URL_TTL);

  return filtered.map((t) => ({
    id: t.id,
    name: t.name,
    category: t.category,
    file_url: frameProxyUrl(urlByKey.get(t.file_url) ?? t.file_url),
    thumbnail_url: t.thumbnail_url ? (urlByKey.get(t.thumbnail_url) ?? null) : null,
    layout: (slotCount(t.layout) > 0 ? t.layout : null) as TemplateLayout | null,
    slot_count: slotCount(t.layout),
  }));
}
