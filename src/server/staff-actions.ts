"use server";

/**
 * Server actions staff (RBAC) — docs/04 §4.13.
 * Dipisah dari finance-actions.ts (action file placement, polish L6).
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { str, toFormState } from "@/lib/form-state";
import { requireUser } from "@/lib/tenant";
import { requireActiveBusiness } from "@/server/action-utils";
import { requireEffectiveSubscription } from "@/server/require-subscription";
import type { FormState } from "@/server/auth-actions";
import {
  acceptStaffInvitation,
  inviteStaff,
  removeStaff,
  setStaffPhotoboxes,
  setStaffPin,
  updateStaffRole,
} from "@/server/staff";

// --- STAFF (docs/04 §4.13) ---

/** Terima undangan staff (AUTH-03) — butuh login sebagai pemilik email. */
export async function acceptInvitationAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await requireUser();
  if (!user) return { error: "Masuk dulu untuk menerima undangan." };
  const token = str(formData, "token");
  if (!token) return { error: "Token undangan tidak valid." };
  let role: "manager" | "staff";
  try {
    const result = await acceptStaffInvitation(user.id, user.email, token);
    role = result.role === "manager" ? "manager" : "staff";
  } catch (error) {
    return toFormState(error, "Gagal menerima undangan.");
  }
  revalidatePath("/dashboard/staff");
  redirect(role === "manager" ? "/dashboard" : "/staff");
}

export async function inviteStaffAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireActiveBusiness();
  if (!ctx) return { error: "Sesi berakhir. Silakan login ulang." };
  await requireEffectiveSubscription(ctx.businessId, "write");
  try {
    await inviteStaff(ctx.user.id, ctx.businessId, {
      email: str(formData, "email"),
      role: (str(formData, "role") || "staff") as "manager" | "staff",
    });
  } catch (error) {
    return toFormState(error);
  }
  revalidatePath("/dashboard/staff");
  return { success: "Undangan dikirim. Akses aktif setelah penerima menyetujui." };
}

export async function setStaffPinAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireActiveBusiness();
  if (!ctx) return { error: "Sesi berakhir. Silakan login ulang." };
  const userId = String(formData.get("user_id") ?? "").trim();
  const photoboxId = String(formData.get("photobox_id") ?? "").trim();
  const pin = String(formData.get("pin") ?? "").trim();
  if (!userId || !photoboxId) return { error: "Data booth tidak valid." };
  try {
    await requireEffectiveSubscription(ctx.businessId, "write");
    await setStaffPin(ctx.user.id, ctx.businessId, userId, photoboxId, pin);
  } catch (error) {
    return toFormState(error, "Gagal menyimpan PIN.");
  }
  revalidatePath("/dashboard/staff");
  return { error: undefined };
}

export async function updateStaffRoleAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const ctx = await requireActiveBusiness();
  if (!ctx) return { error: "Sesi berakhir. Silakan login ulang." };
  const userId = String(formData.get("user_id") ?? "").trim();
  const role = String(formData.get("role") ?? "").trim();
  if (!userId) return { error: "User staff tidak valid." };
  if (!["manager", "staff"].includes(role)) {
    return { error: "Role tidak valid." };
  }
  try {
    await requireEffectiveSubscription(ctx.businessId, "write");
    await updateStaffRole(ctx.user.id, ctx.businessId, userId, {
      role: role as "manager" | "staff",
    });
  } catch (error) {
    return toFormState(error, "Gagal memperbarui role staff.");
  }
  revalidatePath("/dashboard/staff");
  return { error: undefined };
}

export async function removeStaffAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireActiveBusiness();
  if (!ctx) return { error: "Sesi berakhir. Silakan login ulang." };
  const userId = String(formData.get("user_id") ?? "").trim();
  if (!userId) return { error: "User staff tidak valid." };
  try {
    await requireEffectiveSubscription(ctx.businessId, "write");
    await removeStaff(ctx.user.id, ctx.businessId, userId);
  } catch (error) {
    return toFormState(error, "Gagal mengeluarkan staff.");
  }
  revalidatePath("/dashboard/staff");
  return { error: undefined };
}

export async function updateStaffBoothsAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const ctx = await requireActiveBusiness();
  if (!ctx) return { error: "Sesi berakhir. Silakan login ulang." };
  const userId = String(formData.get("user_id") ?? "").trim();
  const photoboxIds = formData
    .getAll("photobox_ids")
    .map((v) => String(v).trim())
    .filter(Boolean);
  if (!userId) return { error: "User staff tidak valid." };
  try {
    await requireEffectiveSubscription(ctx.businessId, "write");
    await setStaffPhotoboxes(ctx.user.id, ctx.businessId, userId, photoboxIds);
  } catch (error) {
    return toFormState(error, "Gagal menyimpan akses booth.");
  }
  revalidatePath("/dashboard/staff");
  return { error: undefined };
}
