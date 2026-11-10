"use server";

/**
 * Server actions Design Builder per-booth — docs/04 §4.8.
 *
 * Nama aksi sengaja berbeda dari aksi lama yang sudah dihapus
 * (`saveBrandingKioskAction`, dst.) supaya permukaan tulis ini eksplisit.
 */

import { revalidatePath } from "next/cache";
import { toFormState } from "@/lib/form-state";
import { can } from "@/lib/rbac";
import {
  brandingSchema,
  kioskBrandingSchema,
  kioskPageIdSchema,
  type BrandingInput,
} from "@/lib/validators";
import { getActiveBusiness, requireUser } from "@/lib/tenant";
import { requireEffectiveSubscription } from "@/server/require-subscription";
import {
  signBrandingAssets,
  updateBranding,
  uploadKioskPageVideo,
  uploadKioskVideo,
  uploadLogo,
  uploadPhotoboxKioskVideo,
  uploadPhotoboxLogo,
} from "@/server/branding";
import { updatePhotoboxBranding } from "@/server/photoboxes";
import type { FormState } from "@/server/auth-actions";

export type SaveBrandingInput = {
  scope: "global" | "booth";
  photoboxId?: string;
  branding: BrandingInput;
  reset?: boolean;
  /**
   * Path bertitik yang harus DIHAPUS dari branding global (mis. `kiosk.video_key`).
   * Merge server mempertahankan key yang tidak dikirim, jadi tombol
   * "Hapus"/"Default" harus eksplisit. Hanya dipakai pada scope global.
   */
  resetKeys?: string[];
};

export type BrandAssetState = FormState & {
  key?: string;
  url?: string;
};

const REVALIDATE = ["/dashboard/branding", "/dashboard/photoboxes"] as const;

function revalidateBuilder() {
  for (const path of REVALIDATE) revalidatePath(path);
}

const PAGE_FIELD_KEYS = new Set([
  "bg_color",
  "text_color",
  "font_scale",
  "button_radius",
  "padding",
  "align",
  "video_key",
]);

/**
 * Allowlist path reset — mencegah klien menghapus key sembarang. Hanya field
 * branding yang memang punya kontrol hapus di builder.
 */
function sanitizeResetKeys(paths: unknown): string[] {
  if (!Array.isArray(paths)) return [];
  const kioskKeys = new Set(Object.keys(kioskBrandingSchema.shape));
  return paths.filter((path): path is string => {
    if (typeof path !== "string") return false;
    const segments = path.split(".");
    if (segments.length === 1) return segments[0] === "logo_key";
    if (segments.length === 2) {
      return segments[0] === "kiosk" && kioskKeys.has(segments[1]!);
    }
    if (segments.length === 3) {
      return (
        segments[0] === "kiosk" &&
        segments[1] === "pages" &&
        kioskPageIdSchema.safeParse(segments[2]).success
      );
    }
    if (segments.length === 4) {
      return (
        segments[0] === "kiosk" &&
        segments[1] === "pages" &&
        kioskPageIdSchema.safeParse(segments[2]).success &&
        PAGE_FIELD_KEYS.has(segments[3]!)
      );
    }
    return false;
  });
}

export async function saveBrandingAction(input: SaveBrandingInput): Promise<FormState> {
  const user = await requireUser();
  if (!user) return { error: "Sesi berakhir. Silakan login ulang." };
  const active = await getActiveBusiness(user.id);
  if (!active) return { error: "Business tidak ditemukan" };

  try {
    await requireEffectiveSubscription(active.business.id, "write");

    if (input.scope === "booth") {
      if (!can(active.role, "photobox:write")) {
        return { error: "Anda tidak punya izin mengubah branding booth." };
      }
      if (!input.photoboxId) return { error: "Pilih booth terlebih dahulu." };
      const branding = input.reset ? null : brandingSchema.parse(input.branding ?? {});
      await updatePhotoboxBranding(
        user.id,
        active.business.id,
        input.photoboxId,
        branding,
        "replace"
      );
    } else {
      if (!can(active.role, "business:update")) {
        return { error: "Anda tidak punya izin mengubah branding global." };
      }
      await updateBranding(
        user.id,
        active.business.id,
        brandingSchema.parse(input.branding ?? {}),
        {
          resetKeys: sanitizeResetKeys(input.resetKeys),
        }
      );
    }
  } catch (error) {
    return toFormState(error, "Gagal menyimpan branding. Coba lagi.");
  }

  revalidateBuilder();
  return { error: undefined };
}

export async function resetBoothBrandingAction(photoboxId: string): Promise<FormState> {
  const user = await requireUser();
  if (!user) return { error: "Sesi berakhir. Silakan login ulang." };
  const active = await getActiveBusiness(user.id);
  if (!active) return { error: "Business tidak ditemukan" };

  try {
    await requireEffectiveSubscription(active.business.id, "write");
    if (!can(active.role, "photobox:write")) {
      return { error: "Anda tidak punya izin mengubah branding booth." };
    }
    if (!photoboxId) return { error: "Pilih booth terlebih dahulu." };
    await updatePhotoboxBranding(user.id, active.business.id, photoboxId, null, "replace");
  } catch (error) {
    return toFormState(error, "Gagal mereset branding booth. Coba lagi.");
  }

  revalidateBuilder();
  return { error: undefined };
}

export async function uploadBrandAssetAction(formData: FormData): Promise<BrandAssetState> {
  const user = await requireUser();
  if (!user) return { error: "Sesi berakhir. Silakan login ulang." };
  const active = await getActiveBusiness(user.id);
  if (!active) return { error: "Business tidak ditemukan" };

  const scope = String(formData.get("scope") ?? "global") === "booth" ? "booth" : "global";
  const rawKind = String(formData.get("kind") ?? "logo");
  const kind = rawKind === "page-video" ? "page-video" : rawKind === "video" ? "video" : "logo";
  const photoboxId = String(formData.get("photoboxId") ?? "");
  const rawPage = String(formData.get("page") ?? "");
  const raw = formData.get("file");
  if (!raw || typeof raw === "string") return { error: "Pilih file terlebih dahulu." };

  try {
    await requireEffectiveSubscription(active.business.id, "write");

    if (scope === "booth") {
      if (kind === "page-video") {
        return { error: "Video per layar hanya tersedia di cakupan global." };
      }
      if (!can(active.role, "photobox:write")) {
        return { error: "Anda tidak punya izin mengubah branding booth." };
      }
      if (!photoboxId) return { error: "Pilih booth terlebih dahulu." };
      const result =
        kind === "logo"
          ? await uploadPhotoboxLogo(user.id, active.business.id, photoboxId, raw)
          : await uploadPhotoboxKioskVideo(user.id, active.business.id, photoboxId, raw);
      revalidateBuilder();
      return { key: result.key ?? undefined, url: result.url ?? undefined };
    }

    if (!can(active.role, "business:update")) {
      return { error: "Anda tidak punya izin mengubah branding global." };
    }

    if (kind === "page-video") {
      const pageId = kioskPageIdSchema.safeParse(rawPage);
      if (!pageId.success) return { error: "Pilih layar kiosk yang valid." };
      const result = await uploadKioskPageVideo(user.id, active.business.id, pageId.data, raw);
      const key = result.kiosk?.pages?.[pageId.data]?.video_key ?? undefined;
      const urls = await signBrandingAssets(result);
      revalidateBuilder();
      return { key, url: key ? urls.get(key) : undefined };
    }

    const result =
      kind === "logo"
        ? await uploadLogo(user.id, active.business.id, raw)
        : await uploadKioskVideo(user.id, active.business.id, raw);
    revalidateBuilder();
    return kind === "logo"
      ? { key: result.logo_key ?? undefined, url: result.logo_url ?? undefined }
      : { key: result.kiosk?.video_key ?? undefined, url: result.kiosk_video_url ?? undefined };
  } catch (error) {
    return toFormState(error, "Gagal mengunggah aset. Coba lagi.");
  }
}
