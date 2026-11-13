"use server";

/**
 * Server actions business — onboarding & workspace switching (docs/04 §4.16).
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { str, toFormState } from "@/lib/form-state";
import {
  ACTIVE_BUSINESS_COOKIE,
  getActiveBusiness,
  getMembership,
  requireUser,
} from "@/lib/tenant";
import { createBusiness, updateBusiness } from "@/server/business";
import type { FormState } from "@/server/auth-actions";
import { SESSION_MAX_AGE_SECONDS } from "@/lib/constants";

export async function createBusinessAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await requireUser();
  if (!user) return { error: "Sesi berakhir. Silakan login ulang." };

  const name = str(formData, "name");
  const slugRaw = str(formData, "slug");
  const input = slugRaw ? { name, slug: slugRaw } : { name };

  try {
    await createBusiness(user.id, input);
  } catch (error) {
    return toFormState(error, "Gagal membuat business. Coba lagi.");
  }

  revalidatePath("/dashboard");
  redirect("/dashboard");
}

/** Update profil bisnis owner (0053) — nama, WhatsApp, owner, email, alamat. */
export async function updateBusinessProfileAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await requireUser();
  if (!user) return { error: "Sesi berakhir. Silakan login ulang." };
  const active = await getActiveBusiness(user.id);
  if (!active) return { error: "Business tidak ditemukan" };

  const name = str(formData, "name");
  const whatsapp = str(formData, "whatsapp");
  const ownerName = str(formData, "owner_name");
  const contactEmail = str(formData, "contact_email");
  const address = str(formData, "address");

  try {
    await updateBusiness(user.id, active.business.id, {
      ...(name ? { name } : {}),
      ...(whatsapp ? { whatsapp } : {}),
      ...(ownerName ? { owner_name: ownerName } : {}),
      contact_email: contactEmail || null,
      address: address || null,
    });
  } catch (error) {
    return toFormState(error, "Gagal menyimpan profil bisnis. Coba lagi.");
  }

  revalidatePath("/dashboard/settings");
  return { error: undefined };
}

export async function switchWorkspaceAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const businessId = str(formData, "businessId");
  if (!user || !businessId) redirect("/login");

  const membership = await getMembership(user.id, businessId);
  if (!membership) redirect("/dashboard");
  // Staff juga boleh pindah workspace (S-002). Shell tujuan mengikuti role
  // pada business yang dipilih.
  const isStaff = membership.role === "staff";
  if (!isStaff && membership.role !== "owner" && membership.role !== "manager") {
    redirect("/dashboard");
  }

  const store = await cookies();
  store.set(ACTIVE_BUSINESS_COOKIE, businessId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  revalidatePath("/dashboard", "layout");
  revalidatePath("/staff", "layout");
  redirect(isStaff ? "/staff" : "/dashboard");
}
