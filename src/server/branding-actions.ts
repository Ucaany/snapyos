"use server";

/**
 * Server actions branding (Photobox Builder) — docs/04 §4.8, docs/12 Phase 3.
 */

import { revalidatePath } from "next/cache";
import { buildCheckoutPayload, str, toFormState } from "@/lib/form-state";
import { requireEffectiveSubscription } from "@/server/require-subscription";
import { getActiveBusiness, requireUser } from "@/lib/tenant";
import {
  updateBranding,
  uploadLogo,
  uploadKioskVideo,
  uploadKioskPageVideo,
} from "@/server/branding";
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

/** Upload logo kiosk, dipanggil dari editor Branding & Kiosk. */
export async function uploadLogoAction(input: {
  logo: {
    name?: string | null;
    type?: string | null;
    size?: number | null;
    arrayBuffer(): Promise<ArrayBuffer>;
  };
}): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  if (!user) return { ok: false, error: "Sesi berakhir. Silakan login ulang." };
  const active = await getActiveBusiness(user.id);
  if (!active) return { ok: false, error: "Business tidak ditemukan" };
  await requireEffectiveSubscription(active.business.id, "write");

  if (!input.logo) return { ok: false, error: "Pilih file logo terlebih dahulu." };

  try {
    await uploadLogo(user.id, active.business.id, input.logo);
  } catch (error) {
    const mapped = toFormState(error, "Gagal mengunggah logo. Coba lagi.");
    return { ok: false, error: mapped.error ?? mapped.fieldErrors?.logo?.[0] };
  }

  revalidatePath("/dashboard/branding");
  return { ok: true };
}

/** Hapus logo kiosk (set logo_key = null), logo kembali kosong. */
export async function deleteLogoAction(): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  if (!user) return { ok: false, error: "Sesi berakhir. Silakan login ulang." };
  const active = await getActiveBusiness(user.id);
  if (!active) return { ok: false, error: "Business tidak ditemukan" };
  await requireEffectiveSubscription(active.business.id, "write");

  try {
    await updateBranding(user.id, active.business.id, { logo_key: null });
  } catch (error) {
    const mapped = toFormState(error, "Gagal menghapus logo. Coba lagi.");
    return { ok: false, error: mapped.error };
  }

  revalidatePath("/dashboard/branding");
  return { ok: true };
}

/** Update branding + kiosk customization — Branding & Kiosk page (SSoT kiosk). */
export async function saveBrandingKioskAction(input: {
  welcome_title?: string;
  welcome_tagline?: string;
  welcome_button?: string;
  primary_color?: string;
  secondary_color?: string;
  kiosk?: Record<string, unknown>;
  /** Layar yang override visualnya dihapus (tombol "Reset layar ini"). */
  reset_pages?: string[];
}): Promise<{ ok: true } | { ok: false; error?: string; fieldErrors?: Record<string, string[]> }> {
  const user = await requireUser();
  if (!user) return { ok: false, error: "Sesi berakhir. Silakan login ulang." };
  const active = await getActiveBusiness(user.id);
  if (!active) return { ok: false, error: "Business tidak ditemukan" };
  await requireEffectiveSubscription(active.business.id, "write");

  // Allowlist id layar: nilai ini dipakai sebagai key jsonb, bukan segmen
  // storage, tapi tetap tidak boleh membawa key sembarang dari client.
  const resetPages = (input.reset_pages ?? []).filter(
    (p) => kioskPageIdSchema.safeParse(p).success
  );
  const { reset_pages: _ignored, ...payload } = input;

  try {
    await updateBranding(user.id, active.business.id, payload, { resetPages });
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
  video: {
    name?: string | null;
    type?: string | null;
    size?: number | null;
    arrayBuffer(): Promise<ArrayBuffer>;
  };
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

/** Hapus video background kiosk global (set video_key = null). */
export async function deleteKioskVideoAction(): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  if (!user) return { ok: false, error: "Sesi berakhir. Silakan login ulang." };
  const active = await getActiveBusiness(user.id);
  if (!active) return { ok: false, error: "Business tidak ditemukan" };
  await requireEffectiveSubscription(active.business.id, "write");

  try {
    await updateBranding(user.id, active.business.id, { kiosk: { video_key: null } });
  } catch (error) {
    const mapped = toFormState(error, "Gagal menghapus video. Coba lagi.");
    return { ok: false, error: mapped.error };
  }

  revalidatePath("/dashboard/branding");
  return { ok: true };
}

/** Hapus video promo per-layar (set pages.<page>.video_key = null). */
export async function deleteKioskPageVideoAction(
  page: string
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  if (!user) return { ok: false, error: "Sesi berakhir. Silakan login ulang." };
  const active = await getActiveBusiness(user.id);
  if (!active) return { ok: false, error: "Business tidak ditemukan" };
  await requireEffectiveSubscription(active.business.id, "write");

  if (!kioskPageIdSchema.safeParse(page).success) {
    return { ok: false, error: "Layar kiosk tidak dikenal." };
  }

  try {
    await updateBranding(user.id, active.business.id, {
      kiosk: { pages: { [page]: { video_key: null } } },
    } as Parameters<typeof updateBranding>[2]);
  } catch (error) {
    const mapped = toFormState(error, "Gagal menghapus video per-layar. Coba lagi.");
    return { ok: false, error: mapped.error };
  }

  revalidatePath("/dashboard/branding");
  return { ok: true };
}
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

  // HANYA kirim offline_enabled bila field memang ada di form ini — kalau tidak,
  // toggle offline (diatur di tempat lain) akan tertimpa jadi `false` setiap simpan.
  const checkout = buildCheckoutPayload(formData);

  try {
    await updateSettings(user.id, active.business.id, { checkout });
  } catch (error) {
    return toFormState(error, "Gagal menyimpan pengaturan checkout. Coba lagi.");
  }

  revalidatePath("/dashboard/settings");
  return { error: undefined };
}
