/**
 * Deteksi area hijau frame → slot mask (docs/15 §15.3).
 *
 * Server-only: decode sharp + storage. Logika deteksi murni ada di
 * `src/lib/frame-chroma.ts`; modul ini hanya orkestrasi I/O + patch layout.
 */

import "server-only";

import { ApiError } from "@/lib/api-errors";
import { greenMask, detectGreenSlots } from "@/lib/frame-chroma";
import { allowedFrameOrigins } from "@/lib/frame-proxy";
import { staleTemplateKeys, storageKeysOnly } from "@/lib/template-cleanup";
import {
  CANVAS_MAX,
  CANVAS_PRESETS,
  MAX_SLOTS,
  emptyLayout,
  layoutSchema,
  maskSlotFromPolygon,
  type LayoutSlot,
  type TemplateLayout,
} from "@/lib/template-layout";
import { createServerClient } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import { getMembership } from "@/lib/tenant";
import { requireAdmin, audit } from "@/server/admin/guard";
import { generateFrameThumbnail } from "@/server/frame-thumbnail";
import { invalidateAllPublicConfig, invalidatePublicConfig } from "@/server/public-config";
import {
  accountStorageAdd,
  accountStorageSub,
  assertStorageAvailable,
} from "@/server/storage-usage";
import { getStorage, resolveStorage, signedUrlMap } from "@/server/storage";
import { insertAudit } from "@/server/audit";
import { SIGNED_URL_TTL_SECONDS as SIGNED_URL_TTL } from "@/lib/constants";

const BUCKET = "business-assets";
const DETECT_MAX_SIDE = 2000;

export type ChromaDetectResult = {
  layout: TemplateLayout;
  frameUrl: string | null;
  skipped: number;
  /** Jumlah slot manual yang dipertahankan. */
  kept: number;
};

type TemplateChromaRow = {
  id: string;
  business_id: string | null;
  file_url: string;
  thumbnail_url: string | null;
  layout: unknown;
};

const isHttpUrl = (value: string) => /^https?:\/\//i.test(value);

function frameProxyEnv() {
  return {
    SUPABASE_URL: process.env.SUPABASE_URL,
    R2_ENDPOINT: process.env.R2_ENDPOINT,
    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
    R2_BUCKET_BUSINESS_ASSETS: process.env.R2_BUCKET_BUSINESS_ASSETS,
    R2_BUCKET: process.env.R2_BUCKET,
    NODE_ENV: process.env.NODE_ENV,
  };
}

/** Bytes frame dari key storage (signed URL) atau URL eksternal ber-allowlist. */
async function readFrameBytes(source: string): Promise<Buffer> {
  if (isHttpUrl(source)) {
    let target: URL;
    try {
      target = new URL(source);
    } catch {
      throw new ApiError("VALIDATION_ERROR", "URL frame tidak valid");
    }
    const env = frameProxyEnv();
    if (!allowedFrameOrigins(env).has(target.origin)) {
      throw new ApiError("VALIDATION_ERROR", "URL frame eksternal tidak diizinkan");
    }
    const response = await fetch(target, { cache: "no-store", redirect: "error" });
    if (!response.ok) throw new ApiError("VALIDATION_ERROR", "Frame tidak bisa diunduh");
    return Buffer.from(await response.arrayBuffer());
  }
  const provider = await resolveStorage(BUCKET, source);
  const { data, error } = await provider.createSignedUrl(BUCKET, source, SIGNED_URL_TTL);
  if (error || !data?.signedUrl) {
    throw new ApiError("VALIDATION_ERROR", "Frame tidak bisa dibaca dari storage");
  }
  const response = await fetch(data.signedUrl, { cache: "no-store" });
  if (!response.ok) throw new ApiError("VALIDATION_ERROR", "Frame tidak bisa diunduh");
  return Buffer.from(await response.arrayBuffer());
}

/** Layout dasar: layout valid apa adanya, atau kanvas baru seukuran frame. */
function baseLayout(raw: unknown, frameW: number, frameH: number): TemplateLayout {
  const parsed = layoutSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  const width = Math.min(CANVAS_MAX, Math.max(1, Math.round(frameW)));
  const height = Math.min(CANVAS_MAX, Math.max(1, Math.round(frameH)));
  const preset =
    (Object.keys(CANVAS_PRESETS) as (keyof typeof CANVAS_PRESETS)[]).find(
      (key) => CANVAS_PRESETS[key].width === width && CANVAS_PRESETS[key].height === height
    ) ?? "custom";
  return {
    ...emptyLayout(preset),
    canvas: { width, height, preset },
  };
}

function nextSlotId(taken: Set<string>): string {
  let seq = 1;
  while (taken.has(`mask-${seq}`)) seq += 1;
  return `mask-${seq}`;
}

/**
 * Inti deteksi untuk satu baris template. `scope` menentukan update yang
 * diizinkan (owner: business_id; admin: baris global).
 */
async function runDetection(
  row: TemplateChromaRow,
  scope: { businessId: string | null },
  actor: { actorId: string; isAdmin: boolean }
): Promise<ChromaDetectResult> {
  const parsedLayout = layoutSchema.safeParse(row.layout);
  const chromaMeta = parsedLayout.success ? parsedLayout.data.chroma : undefined;
  const ownerId = scope.businessId ?? row.business_id;
  // `layout` bisa ditulis owner, jadi `chroma.source_key` TIDAK dipercaya
  // sebagai path baca: hanya key di prefix milik baris ini (atau URL
  // ber-allowlist) yang boleh jadi sumber. Selain itu jatuh ke file_url.
  const ownedPrefix = `${ownerId ?? "global"}/`;
  const trustedSource = [chromaMeta?.source_key, chromaMeta?.source_url].find(
    (candidate): candidate is string =>
      typeof candidate === "string" &&
      (isHttpUrl(candidate) || candidate.startsWith(ownedPrefix))
  );
  // Idempoten: setelah run pertama, sumber selalu file asli tanpa hijau.
  const source = trustedSource ?? row.file_url;

  const sourceBytes = await readFrameBytes(source);

  const sharp = (await import("sharp")).default;
  // `.rotate()` menghormati EXIF agar koordinat deteksi sama dengan yang
  // digambar browser/kiosk (thumbnail juga memakai `.rotate()`).
  const { data: fullRaw, info: fullInfo } = await sharp(sourceBytes, { failOn: "none" })
    .rotate()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (fullInfo.channels !== 4) {
    throw new ApiError("INTERNAL", "Gagal menyiapkan buffer RGBA full frame");
  }
  const frameW = fullInfo.width;
  const frameH = fullInfo.height;
  if (frameW <= 0 || frameH <= 0) {
    throw new ApiError("VALIDATION_ERROR", "Frame tidak bisa dibaca");
  }

  const scale = Math.min(1, DETECT_MAX_SIDE / Math.max(frameW, frameH));
  const detectW = Math.max(1, Math.round(frameW * scale));
  const detectH = Math.max(1, Math.round(frameH * scale));
  const { data: raw, info } = await sharp(sourceBytes, { failOn: "none" })
    .rotate()
    .ensureAlpha()
    .resize({ width: detectW, height: detectH, fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.channels !== 4) {
    throw new ApiError("INTERNAL", "Gagal menyiapkan buffer RGBA frame");
  }

  const layout = baseLayout(row.layout, frameW, frameH);
  // Slot manual dipertahankan; slot mask lama dibuang agar deteksi ulang
  // idempoten (mask hanya lahir dari deteksi, bukan dibuat manual).
  const keptSlots = [...layout.slots]
    .filter((slot) => slot.shape !== "mask")
    .sort((a, b) => a.z - b.z)
    .map((slot, index) => ({ ...slot, z: index }));
  // Kapasitas slot tersisa setelah slot manual dipertahankan.
  const capacity = Math.max(1, MAX_SLOTS - keptSlots.length);
  const { polygons, skipped: overflow } = detectGreenSlots(
    new Uint8ClampedArray(raw),
    detectW,
    detectH,
    layout.canvas.width,
    layout.canvas.height,
    capacity
  );
  if (polygons.length === 0) {
    throw new ApiError("VALIDATION_ERROR", "Tidak ada area hijau terdeteksi");
  }

  const takenIds = new Set(keptSlots.map((slot) => slot.id));
  const maskSlots: LayoutSlot[] = [];
  let skipped = overflow;
  let z = keptSlots.length;
  for (const polygon of polygons) {
    if (z >= MAX_SLOTS) {
      skipped += 1;
      continue;
    }
    const slot = maskSlotFromPolygon(polygon.points, z, nextSlotId(takenIds));
    if (slot.width < 2 || slot.height < 2) {
      skipped += 1;
      continue;
    }
    takenIds.add(slot.id);
    maskSlots.push(slot);
    z += 1;
  }
  if (maskSlots.length === 0) {
    throw new ApiError("VALIDATION_ERROR", "Tidak ada area hijau yang layak dijadikan slot");
  }

  // Frame bersih: piksel yang sama dengan mask deteksi dijadikan transparan.
  // ponytail: alpha biner, bukan band lembut `applyChromaKey` — lubang file
  // harus identik dengan poligon slot. Ganti ke band lembut bila fringe hijau
  // terlihat pada hasil cetak.
  const fullRgba = new Uint8ClampedArray(fullRaw);
  const fullMask = greenMask(fullRgba, fullInfo.width, fullInfo.height);
  for (let i = 0; i < fullMask.length; i += 1) {
    if (fullMask[i]) fullRgba[i * 4 + 3] = 0;
  }
  const cleanedPng = await sharp(Buffer.from(fullRgba.buffer), {
    raw: { width: fullInfo.width, height: fullInfo.height, channels: 4 },
  })
    .png()
    .toBuffer();

  if (ownerId) await assertStorageAvailable(ownerId, cleanedPng.length);

  const baseName = `${ownerId ?? "global"}/templates/${Date.now()}-chroma`;
  const newKey = `${baseName}.png`;
  const { error: uploadError } = await getStorage().upload(BUCKET, newKey, cleanedPng, {
    contentType: "image/png",
    upsert: false,
  });
  if (uploadError) throw new ApiError("INTERNAL", "Gagal menyimpan frame tanpa hijau");
  if (ownerId) await accountStorageAdd(ownerId, BUCKET, newKey, cleanedPng.length);

  let thumbKey = newKey;
  const thumb = await generateFrameThumbnail(cleanedPng);
  if (thumb) {
    const candidate = `${baseName}-thumb.${thumb.extension}`;
    const { error } = await getStorage().upload(BUCKET, candidate, thumb.bytes, {
      contentType: thumb.contentType,
      upsert: false,
    });
    if (!error) {
      thumbKey = candidate;
      if (ownerId) await accountStorageAdd(ownerId, BUCKET, candidate, thumb.bytes.length);
    }
  }

  const nextLayout: TemplateLayout = {
    ...layout,
    slots: [...keptSlots, ...maskSlots],
    chroma: {
      source_key: isHttpUrl(source) ? null : source,
      source_url: isHttpUrl(source) ? source : null,
      detected_at: new Date().toISOString(),
      // Schema membatasi `skipped`; angka raksasa bukan informasi berguna.
      skipped: Math.min(skipped, MAX_SLOTS * 100),
    },
  };
  const valid = layoutSchema.safeParse(nextLayout);
  if (!valid.success) {
    throw new ApiError("INTERNAL", "Layout hasil deteksi tidak valid");
  }

  const supabase = createServerClient();
  let update = supabase
    .from("templates")
    .update({ file_url: newKey, thumbnail_url: thumbKey, layout: valid.data })
    .eq("id", row.id);
  update = scope.businessId
    ? update.eq("business_id", scope.businessId)
    : update.is("business_id", null);
  const { data: updated, error } = await update.select("id").maybeSingle();
  if (error) throw new ApiError("INTERNAL", "Gagal menyimpan hasil deteksi");
  if (!updated) throw new ApiError("NOT_FOUND", "Template tidak ditemukan");

  // Hapus file lama; file asli (source) selalu dipertahankan untuk deteksi ulang.
  const removable = storageKeysOnly(
    staleTemplateKeys({
      oldFile: row.file_url,
      oldThumbnail: row.thumbnail_url,
      newKey: source,
    })
  ).filter((key) => key !== newKey && key !== thumbKey);
  if (removable.length > 0) {
    const provider = await resolveStorage(BUCKET, removable[0]!);
    const { error: removeError } = await provider.remove(BUCKET, removable);
    if (removeError) {
      console.error("[template-chroma] gagal menghapus file lama:", removeError.message);
    } else if (ownerId) {
      await accountStorageSub(ownerId, removable);
    }
  }

  if (actor.isAdmin) {
    await audit(actor.actorId, "template.chroma.detect", row.id, {
      slots: maskSlots.length,
      skipped,
    });
    invalidateAllPublicConfig();
  } else {
    await insertAudit({
      actorId: actor.actorId,
      businessId: scope.businessId,
      action: "template.chroma.detect",
      target: row.id,
      meta: { slots: maskSlots.length, skipped },
    });
    if (scope.businessId) invalidatePublicConfig(scope.businessId);
  }

  const urls = await signedUrlMap(BUCKET, [newKey], SIGNED_URL_TTL);
  return { layout: valid.data, frameUrl: urls.get(newKey) ?? null, skipped, kept: keptSlots.length };
}

/** Owner: deteksi area hijau pada template milik business-nya. */
export async function extractFrameChromaSlots(
  userId: string,
  businessId: string,
  templateId: string
): Promise<ChromaDetectResult> {
  const membership = await getMembership(userId, businessId);
  if (!membership) throw new ApiError("NOT_FOUND", "Business tidak ditemukan");
  if (!can(membership.role, "template:write")) {
    throw new ApiError("FORBIDDEN", "Anda tidak punya izin untuk aksi ini");
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("templates")
    .select("id, business_id, file_url, thumbnail_url, layout")
    .eq("id", templateId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) throw new ApiError("INTERNAL", "Gagal memuat template");
  if (!data) throw new ApiError("NOT_FOUND", "Template tidak ditemukan");

  return runDetection(
    data as TemplateChromaRow,
    { businessId },
    { actorId: userId, isAdmin: false }
  );
}

/** Admin: deteksi area hijau pada template global (business_id NULL). */
export async function extractGlobalFrameChromaSlots(
  templateId: string
): Promise<ChromaDetectResult> {
  const admin = await requireAdmin();
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("templates")
    .select("id, business_id, file_url, thumbnail_url, layout")
    .eq("id", templateId)
    .is("business_id", null)
    .maybeSingle();
  if (error) throw new ApiError("INTERNAL", "Gagal memuat template global");
  if (!data) throw new ApiError("NOT_FOUND", "Template global tidak ditemukan");

  return runDetection(
    data as TemplateChromaRow,
    { businessId: null },
    { actorId: admin.id, isAdmin: true }
  );
}
