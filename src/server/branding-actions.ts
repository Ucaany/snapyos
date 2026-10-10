"use server";

/**
 * Server actions branding (Photobox Builder) — docs/04 §4.8, docs/12 Phase 3.
 */

import { revalidatePath } from "next/cache";
import { bool, str, toFormState } from "@/lib/form-state";
import { requireEffectiveSubscription } from "@/server/require-subscription";
import { getActiveBusiness, requireUser } from "@/lib/tenant";
import { getBranding, updateBranding, uploadLogo, uploadKioskVideo, uploadKioskPageVideo } from "@/server/branding";
import { updateSettings } from "@/server/business";
import { kioskPageIdSchema } from "@/lib/validators";
import type { FormState } from "@/server/auth-actions";

export async function updateBrandingAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await requireUser();
  if (!user) return { error: "Sesi berakhir. Silakan login ulang." };
  const active = await getActiveBusiness(user.id);
  if (!active) return { error: "Business tidak ditemukan" };
  await requireEffectiveSubscription(active.business.id, "write");

  const input = {
    welcome_title: str(formData, "welcome_title") || undefined,
    welcome_tagline: str(formData, "welcome_tagline") || undefined,
    welcome_button: str(formData, "welcome_button") || undefined,
    primary_color: str(formData, "primary_color") || undefined,
    secondary_color: str(formData, "secondary_color") || undefined,
  };

  try {
    await updateBranding(user.id, active.business.id, input);
  } catch (error) {
    return toFormState(error, "Gagal menyimpan branding. Coba lagi.");
  }

  revalidatePath("/dashboard/settings");
  return { error: undefined };
}

export async function uploadLogoAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await requireUser();
  if (!user) return { error: "Sesi berakhir. Silakan login ulang." };
  const active = await getActiveBusiness(user.id);
  if (!active) return { error: "Business tidak ditemukan" };
  await requireEffectiveSubscription(active.business.id, "write");

  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) {
    return { fieldErrors: { logo: ["Pilih file logo terlebih dahulu"] } };
  }

  try {
    await uploadLogo(user.id, active.business.id, file);
  } catch (error) {
    return toFormState(error, "Gagal mengunggah logo. Coba lagi.");
  }

  revalidatePath("/dashboard/settings");
  return { error: undefined };
}

/** Update branding + kiosk customization — Branding & Kiosk page (SSoT kiosk). */
export async function saveBrandingKioskAction(input: {
  welcome_title?: string;
  welcome_tagline?: string;
  welcome_button?: string;
  primary_color?: string;
  secondary_color?: string;
  kiosk?: Record<string, unknown>;
}): Promise<{ ok: true } | { ok: false; error?: string; fieldErrors?: Record<string, string[]> }> {
  const user = await requireUser();
  if (!user) return { ok: false, error: "Sesi berakhir. Silakan login ulang." };
  const active = await getActiveBusiness(user.id);
  if (!active) return { ok: false, error: "Business tidak ditemukan" };
  await requireEffectiveSubscription(active.business.id, "write");

  try {
    await updateBranding(user.id, active.business.id, input);
  } catch (error) {
    // Peta ke shape `{ok:false}` yang khas action ini — pakai toFormState
    // (kanonis) agar tidak duplikasi blok Zod/ApiError manual di file lain.
    const mapped = toFormState(error, "Gagal menyimpan kustomisasi kiosk. Coba lagi.");
    return { ok: false, error: mapped.error, fieldErrors: mapped.fieldErrors };
  }

  revalidatePath("/dashboard/branding");
  return { ok: true };
}

/** Upload video background kiosk (durasi ≤5s divalidasi client, tipe/size server). */
export async function uploadKioskVideoAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await requireUser();
  if (!user) return { error: "Sesi berakhir. Silakan login ulang." };
  const active = await getActiveBusiness(user.id);
  if (!active) return { error: "Business tidak ditemukan" };
  await requireEffectiveSubscription(active.business.id, "write");

  const file = formData.get("video");
  if (!(file instanceof File) || file.size === 0) {
    return { fieldErrors: { video: ["Pilih file video terlebih dahulu"] } };
  }

  try {
    await uploadKioskVideo(user.id, active.business.id, file);
  } catch (error) {
    return toFormState(error, "Gagal mengunggah video. Coba lagi.");
  }

  revalidatePath("/dashboard/branding");
  return { error: undefined };
}

/** Upload video promo per-layar (mis. layar kamera awal) — `page` = id layar kiosk. */
export async function uploadKioskPageVideoAction(input: {
  page: string;
  video: { name?: string | null; type?: string | null; size?: number | null; arrayBuffer(): Promise<ArrayBuffer> };
}): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  if (!user) return { ok: false, error: "Sesi berakhir. Silakan login ulang." };
  const active = await getActiveBusiness(user.id);
  if (!active) return { ok: false, error: "Business tidak ditemukan" };
  await requireEffectiveSubscription(active.business.id, "write");

  if (!input.page || !input.video) {
    return { ok: false, error: "Pilih layar dan file video terlebih dahulu." };
  }
  if (!kioskPageIdSchema.safeParse(input.page).success) {
    return { ok: false, error: "Layar kiosk tidak dikenal." };
  }

  try {
    await uploadKioskPageVideo(user.id, active.business.id, input.page, input.video);
  } catch (error) {
    const mapped = toFormState(error, "Gagal mengunggah video per-layar. Coba lagi.");
    return { ok: false, error: mapped.error };
  }

  revalidatePath("/dashboard/branding");
  return { ok: true };
}

/** Update retention hasil foto (hari) — owner-configurable, default 7 (docs/09 §9.8). */
export async function updateRetentionSettingsAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await requireUser();
  if (!user) return { error: "Sesi berakhir. Silakan login ulang." };
  const active = await getActiveBusiness(user.id);
  if (!active) return { error: "Business tidak ditemukan" };
  await requireEffectiveSubscription(active.business.id, "write");

  const days = Number(str(formData, "retention_days"));
  if (!Number.isInteger(days) || days < 1 || days > 3) {
    return { fieldErrors: { retention_days: ["Isi 1–3 hari"] } };
  }

  try {
    await updateSettings(user.id, active.business.id, { retention_days: days });
  } catch (error) {
    return toFormState(error, "Gagal menyimpan pengaturan retensi. Coba lagi.");
  }

  revalidatePath("/dashboard/settings");
  return { error: undefined };
}

/** Update checkout settings (qris_expiry_minutes, offline_enabled — docs/06 §6.3, docs/05). */
export async function updateCheckoutSettingsAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await requireUser();
  if (!user) return { error: "Sesi berakhir. Silakan login ulang." };
  const active = await getActiveBusiness(user.id);
  if (!active) return { error: "Business tidak ditemukan" };
  await requireEffectiveSubscription(active.business.id, "write");

  const minutes = Number(str(formData, "qris_expiry_minutes"));
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 60) {
    return { fieldErrors: { qris_expiry_minutes: ["Isi 1–60 menit"] } };
  }
  const offlineEnabled = bool(formData, "offline_enabled");

  try {
    await updateSettings(user.id, active.business.id, {
      checkout: { qris_expiry_minutes: minutes, offline_enabled: offlineEnabled },
    });
  } catch (error) {
    return toFormState(error, "Gagal menyimpan pengaturan checkout. Coba lagi.");
  }

  revalidatePath("/dashboard/settings");
  return { error: undefined };
}
