"use server";

/**
 * Server actions branding (Photobox Builder) — docs/04 §4.8, docs/12 Phase 3.
 */

import { revalidatePath } from "next/cache";
import { buildCheckoutPayload, str, toFormState } from "@/lib/form-state";
import { requireEffectiveSubscription } from "@/server/require-subscription";
import { getActiveBusiness, requireUser } from "@/lib/tenant";
import { updateSettings } from "@/server/business";
import type { FormState } from "@/server/auth-actions";

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
