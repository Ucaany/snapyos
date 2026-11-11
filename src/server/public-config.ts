/**
 * Public config kiosk — docs/05 §5.2–5.4, docs/08 §8.14.
 * Tanpa login; resolve business + photobox via slug. Data hanya yang aktif.
 */

import "server-only";
import { unstable_cache, updateTag } from "next/cache";
import { createHash } from "node:crypto";
import { createServerClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/api-errors";
import { brandingSchema, isBrandingStorageKey } from "@/lib/validators";
import { mergeBranding } from "@/lib/branding-merge";
import { slotCount, type TemplateLayout } from "@/lib/template-layout";
import { selectVisibleTemplates } from "@/lib/template-visibility";
import {
  PUBLIC_CONFIG_GLOBAL_TAG,
  publicConfigCacheTags,
  templateCacheKey,
} from "@/lib/template-cache";
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

/** Tag data-cache public config (dipakai mutasi branding untuk updateTag).
 *  Diturunkan dari helper murni `publicConfigCacheTags` — hindari drift literal. */
export const publicConfigCacheTag = (businessId: string) => publicConfigCacheTags(businessId)[0]!;

/** Tag global: mutasi template platform-global mengubah kiosk SEMUA tenant. */
export const publicConfigGlobalTag = PUBLIC_CONFIG_GLOBAL_TAG;

/** Buang entri cache kiosk setelah mutasi yang mengubah isi public config
 *  (branding, photobox, package, template). Tanpa ini kiosk menunggu TTL 30s. */
export function invalidatePublicConfig(businessId: string) {
  updateTag(publicConfigCacheTag(businessId));
}

/** Buang cache public config seluruh business (template global berubah). */
export function invalidateAllPublicConfig() {
  updateTag(publicConfigGlobalTag);
}

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
      "id, slug, name, status, outlet_id, camera_settings, print_settings, session_settings, device_status, branding, default_template_id"
    )
    .eq("business_id", businessId)
    .eq("slug", slug)
    .maybeSingle();
  if (!data) throw new ApiError("NOT_FOUND", "Photobox tidak ditemukan");
  return data;
}

export async function getPublicConfig(
  businessSlug: string,
  photoboxSlug: string
): Promise<PublicConfig> {
  const business = await resolveBusinessBySlug(businessSlug);
  // Cache per business+photobox (tag business:<id>:public-config). Mutasi
  // branding memanggil updateTag → entri basi dibuang, poll berikutnya segar.
  const config = await unstable_cache(
    () => buildPublicConfig(business, photoboxSlug),
    ["public-config", business.id, photoboxSlug],
    { tags: publicConfigCacheTags(business.id), revalidate: PUBLIC_CONFIG_TTL_SECONDS }
  )();
  return { ...config, etag: etagOf(config) };
}

/** Hash ETag dari konten stabil. Signed URL berubah tiap presign (signature +
 *  expiry di query), jadi query string dibuang: path objek tetap unik per file,
 *  sehingga ganti logo/video tetap mengubah ETag tanpa memicu 200 tiap TTL. */
function etagOf(config: Omit<PublicConfig, "etag">): string {
  const stable = JSON.stringify(
    {
      business: config.business,
      branding: config.branding,
      photobox: config.photobox,
      packages: config.packages,
      checkout: config.checkout,
    },
    (_key, value) => {
      // Hanya URL bertanda tangan yang di-strip; teks biasa boleh mengandung "?".
      if (typeof value !== "string") return value;
      if (!value.startsWith("http")) return value;
      if (!/[?&](X-Amz-Signature|token)=/.test(value)) return value;
      return value.split("?")[0];
    }
  );
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
  const merged = mergeBranding(globalBranding, booth);

  // Signed URL untuk logo + video global + video per-layar (batch, anti N+1).
  const pageVideoKeys = Object.values(merged.kiosk?.pages ?? {})
    .map((p) => p?.video_key)
    .filter((k): k is string => Boolean(k));
  const videoKeys = [merged.logo_key, merged.kiosk?.video_key, ...pageVideoKeys].filter(
    // Hanya key di folder tenant ini yang boleh di-sign — baris lama bisa
    // menunjuk objek tenant lain (lihat isBrandingStorageKey).
    (k): k is string =>
      typeof k === "string" && k.length > 0 && isBrandingStorageKey(business.id, k)
  );
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
      font_family: merged.kiosk?.font_family,
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
    (settings as { checkout?: { offline_enabled?: boolean } } | null)?.checkout?.offline_enabled ===
    true;

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
      camera_settings:
        (photobox.camera_settings as PublicConfig["photobox"]["camera_settings"]) ?? {},
      print_settings: (photobox.print_settings as PublicConfig["photobox"]["print_settings"]) ?? {},
      session_settings:
        (photobox.session_settings as PublicConfig["photobox"]["session_settings"]) ?? {},
      device_status: (photobox.device_status as Record<string, unknown>) ?? null,
      // Tanpa ini kiosk tidak tahu template default booth dan selalu memaksa
      // customer memilih frame (auto-pick di TemplatePicker butuh id ini).
      default_template_id:
        (photobox as { default_template_id?: string | null }).default_template_id ?? null,
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
      .select(
        "id, name, price, photo_count, print_count, digital_output, capture_mode, description"
      )
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
 * Template aktif milik business/global untuk kiosk (docs/05 §5.4,
 * docs/15 §15.6).
 *
 * Aturan pilih: assignment package mempersempit daftar, tapi tidak pernah
 * mengosongkannya. Semua slot template valid untuk package; template legacy
 * tanpa slot memakai `package.photo_count` sebagai fallback capture.
 */
/**
 * `cache` = basis key aset stabil (`templateId:version`). Server hanya
 * meneruskannya; SW memakai nilai itu untuk lookup Cache Storage (lihat
 * `src/lib/template-cache.ts` + `public/sw.js`).
 */
function frameProxyUrl(url: string, cacheKey: string, width?: number): string {
  if (!/^https?:\/\//i.test(url)) return url;
  const params = new URLSearchParams({ url, cache: cacheKey });
  if (width) params.set("w", String(width));
  return `/api/v1/public/frame?${params.toString()}`;
}

export async function listPublicTemplates(
  businessId: string,
  packageId?: string
): Promise<PublicTemplate[]> {
  const supabase = createServerClient();
  const query = supabase
    .from("templates")
    .select(
      "id, business_id, name, category, file_url, thumbnail_url, layout, is_active, is_premium, price, updated_at"
    )
    .eq("is_active", true)
    .or(`business_id.eq.${businessId},business_id.is.null`)
    .order("created_at")
    .order("id");

  const { data: templates } = await query;
  const rows = (templates ?? []) as {
    id: string;
    business_id: string | null;
    name: string;
    category: string;
    file_url: string;
    thumbnail_url: string | null;
    layout: unknown;
    is_active: boolean;
    is_premium: boolean;
    price: number | null;
    updated_at: string | null;
  }[];

  // Template global premium hanya tampil bila sudah dibeli business ini.
  const { data: owned } = await supabase
    .from("business_template_purchases")
    .select("template_id")
    .eq("business_id", businessId);
  const ownedIds = new Set(((owned ?? []) as { template_id: string }[]).map((o) => o.template_id));

  const visible = rows.filter((t) => {
    // (a) Milik business sendiri → selalu tampil.
    if (t.business_id === businessId) return true;
    // (b) & (c) hanya template global; business lain tidak pernah tampil.
    if (t.business_id !== null) return false;
    const free = !t.is_premium || t.price == null || t.price === 0;
    // (b) global gratis wajib aktif; (c) global yang sudah dibeli tetap tampil.
    return (t.is_active && free) || ownedIds.has(t.id);
  });

  // Satu query assignment untuk semua template tampil — dipakai klien untuk
  // memfilter per paket tanpa request per paket. Lewati query saat kosong:
  // `.in('col', [])` tidak perlu dan hanya menambah round-trip.
  const linkRows: { template_id: string; package_id: string }[] = [];
  if (visible.length > 0) {
    const { data: links } = await supabase
      .from("package_templates")
      .select("template_id, package_id")
      .in(
        "template_id",
        visible.map((t) => t.id)
      );
    linkRows.push(...((links ?? []) as { template_id: string; package_id: string }[]));
  }
  const packageIdsByTemplate = new Map<string, string[]>();
  for (const link of linkRows) {
    const list = packageIdsByTemplate.get(link.template_id) ?? [];
    list.push(link.package_id);
    packageIdsByTemplate.set(link.template_id, list);
  }

  let allowed: Set<string> | null = null;
  if (packageId) {
    allowed = new Set(
      [...packageIdsByTemplate.entries()]
        .filter(([, ids]) => ids.includes(packageId))
        .map(([templateId]) => templateId)
    );
  }

  // Semua frame aktif tampil untuk paket mana pun. Runtime menentukan jumlah
  // capture dari slot frame; `photo_count` hanya fallback untuk legacy.
  const filtered = selectVisibleTemplates(visible, { assignedIds: allowed });

  // Batch signed URL — satu request storage untuk seluruh daftar (bukan N+1).
  const keys = Array.from(
    new Set(
      filtered.flatMap((t) => {
        const ks = [t.file_url];
        if (t.thumbnail_url) ks.push(t.thumbnail_url);
        return ks;
      })
    )
  );
  const urlByKey = await signedUrlMap(BRAND_ASSETS_BUCKET, keys, SIGNED_URL_TTL);

  // Template tanpa frame yang bisa dimuat tidak boleh ditawarkan: Editor
  // memblokir finish saat frame gagal dimuat, jadi sesi customer berakhir buntu.
  return filtered.flatMap((t) => {
    const fileUrl = /^https?:\/\//i.test(t.file_url) ? t.file_url : urlByKey.get(t.file_url);
    if (!fileUrl) return [];
    // `version` = waktu ubah template → key cache aset berubah saat file diganti.
    const parsed = t.updated_at ? Date.parse(t.updated_at) : Number.NaN;
    const version = Number.isFinite(parsed) ? parsed : 0;
    const cacheKey = templateCacheKey(t.id, version);
    const thumb = t.thumbnail_url ? urlByKey.get(t.thumbnail_url) : undefined;
    // Data lama menyimpan thumbnail = frame (tidak ada thumbnail terpisah).
    // Jangan kirim PNG penuh ke grid: minta versi 480px dari proxy frame.
    const thumbUrl = thumb ?? `${fileUrl}${fileUrl.includes("?") ? "&" : "?"}w=480`;
    return [
      {
        id: t.id,
        name: t.name,
        category: t.category,
        file_url: frameProxyUrl(fileUrl, cacheKey),
        // Thumbnail selalu URL siap pakai; key mentah tidak pernah dikirim
        // sebagai src (bukan URL, akan 404 di origin kiosk).
        thumbnail_url: frameProxyUrl(thumbUrl, cacheKey, 480),
        layout: (slotCount(t.layout) > 0 ? t.layout : null) as TemplateLayout | null,
        slot_count: slotCount(t.layout),
        version,
        package_ids: packageIdsByTemplate.get(t.id) ?? [],
      },
    ];
  });
}
