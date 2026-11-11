"use server";

/**
 * Server actions outlets & photoboxes — docs/12 Phase 3 UI.
 * Selalu scoped ke business aktif (cookie, divalidasi via membership).
 */

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { str, toFormState } from "@/lib/form-state";
import { verifyTurnstile } from "@/lib/turnstile";
import { getClientIp } from "@/lib/request-ip";
import { requireActiveBusiness } from "@/server/action-utils";
import { requireEffectiveSubscription } from "@/server/require-subscription";
import { createOutlet, deleteOutlet, updateOutlet } from "@/server/outlets";
import { createPhotobox, deletePhotobox, updatePhotobox } from "@/server/photoboxes";
import { forbiddenPhotoboxFields } from "@/lib/photobox-form-fields";
import type { FormState } from "@/server/auth-actions";

// --- OUTLETS ---

export async function createOutletAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireActiveBusiness();
  if (!ctx) return { error: "Sesi berakhir. Silakan login ulang." };
  await requireEffectiveSubscription(ctx.businessId, "write");

  try {
    await createOutlet(ctx.user.id, ctx.businessId, {
      name: str(formData, "name"),
      address: str(formData, "address") || undefined,
      city: str(formData, "city") || undefined,
      province: str(formData, "province") || undefined,
    });
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath("/dashboard/outlets");
  revalidatePath("/dashboard/photoboxes");
  return { error: undefined };
}

export async function updateOutletAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireActiveBusiness();
  if (!ctx) return { error: "Sesi berakhir. Silakan login ulang." };
  await requireEffectiveSubscription(ctx.businessId, "write");

  const id = str(formData, "id");
  if (!id) return { error: "Outlet tidak valid" };

  try {
    await updateOutlet(ctx.user.id, ctx.businessId, id, {
      name: str(formData, "name"),
      address: str(formData, "address") || null,
      city: str(formData, "city") || null,
      province: str(formData, "province") || null,
      status: str(formData, "status") === "inactive" ? "inactive" : "active",
    });
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath("/dashboard/outlets");
  return { error: undefined };
}

export async function deleteOutletAction(formData: FormData): Promise<FormState> {
  const ctx = await requireActiveBusiness();
  const id = String(formData.get("id") ?? "");
  if (!ctx) return { error: "Sesi berakhir. Silakan login ulang." };
  if (!id) return { error: "Data tidak valid." };
  try {
    await requireEffectiveSubscription(ctx.businessId, "write");
    await deleteOutlet(ctx.user.id, ctx.businessId, id);
  } catch (error) {
    return toFormState(error, "Gagal menghapus outlet. Coba lagi.");
  }
  revalidatePath("/dashboard/outlets");
  return { error: undefined };
}

// --- PHOTOBOXES ---

function photoboxInput(formData: FormData) {
  const formValue = (key: string) => {
    const direct = formData.get(key);
    if (direct != null && String(direct).trim()) return String(direct).trim();
    const prefixedKey = [...formData.keys()].find((candidate) => candidate.endsWith(`_${key}`));
    return prefixedKey ? String(formData.get(prefixedKey) ?? "").trim() : "";
  };
  const number = (key: string, fallback: number) => {
    const value = Number(formData.get(key));
    return Number.isFinite(value) ? value : fallback;
  };
  return {
    name: str(formData, "name"),
    slug: str(formData, "slug") || undefined,
    outlet_id: formValue("outlet_id"),
    status: (str(formData, "status") || "offline") as "online" | "offline" | "maintenance",
    payment_mode: (str(formData, "payment_mode") || null) as "gateway" | "voucher" | null,
    // Hanya dua field cetak milik cloud. Sisanya (printer_name, paper_size,
    // margins_mm, mode) dilaporkan aplikasi booth lewat device token.
    print_settings: {
      layout: str(formData, "print_layout") === "strip" ? ("strip" as const) : ("single" as const),
      copies: number("copies", 1),
    },
    // Perangkat (kamera/printer/display) tidak diisi manual —
    // auto-detect saat device pairing (docs/05 §5.0.1, Phase 4).
  };
}

/** Tolak field yang bukan milik dashboard bila dikirim dari sesi pengguna. */
function rejectTechnicalFields(formData: FormData): FormState | null {
  const rejected = forbiddenPhotoboxFields(formData.keys());
  if (rejected.length === 0) return null;
  return {
    error: `Field ini tidak bisa diubah dari dashboard: ${rejected.join(", ")}. Setelan mesin diatur dari aplikasi booth.`,
  };
}

async function createPhotoboxAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireActiveBusiness();
  if (!ctx) return { error: "Sesi berakhir. Silakan login ulang." };
  const rejected = rejectTechnicalFields(formData);
  if (rejected) return rejected;
  await requireEffectiveSubscription(ctx.businessId, "write");

  // CAPTCHA (Turnstile) — hanya saat CREATE (bukan edit). Fail-closed di prod.
  const token = String(formData.get("cf-turnstile-response") ?? "");
  const ip = getClientIp(await headers());
  if (
    !(await verifyTurnstile(token, {
      remoteIp: ip,
      expectedAction: "create-photobox",
    }))
  ) {
    return { error: "Verifikasi keamanan gagal. Muat ulang halaman lalu coba lagi." };
  }

  try {
    await createPhotobox(ctx.user.id, ctx.businessId, photoboxInput(formData));
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath("/dashboard/photoboxes");
  revalidatePath("/dashboard");
  return { error: undefined };
}

async function updatePhotoboxAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireActiveBusiness();
  if (!ctx) return { error: "Sesi berakhir. Silakan login ulang." };
  const rejected = rejectTechnicalFields(formData);
  if (rejected) return rejected;
  await requireEffectiveSubscription(ctx.businessId, "write");

  const id = str(formData, "id");
  if (!id) return { error: "Photobox tidak valid" };

  try {
    await updatePhotobox(ctx.user.id, ctx.businessId, id, photoboxInput(formData));
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath("/dashboard/photoboxes");
  return { error: undefined };
}

export async function savePhotoboxAction(prev: FormState, formData: FormData): Promise<FormState> {
  const normalized = new FormData();
  for (const [key, value] of formData.entries()) {
    if (key === "0") continue;
    // Token CAPTCHA di-inject Cloudflare di luar prefix useActionState.
    // Jangan ikut di-rename; server action membacanya dengan nama asli.
    normalized.append(key.startsWith("cf-") ? key : key.replace(/^_\d+_/, ""), value);
  }
  return str(normalized, "id")
    ? updatePhotoboxAction(prev, normalized)
    : createPhotoboxAction(prev, normalized);
}

export async function deletePhotoboxAction(formData: FormData): Promise<FormState> {
  const ctx = await requireActiveBusiness();
  const id = String(formData.get("id") ?? "");
  if (!ctx) return { error: "Sesi berakhir. Silakan login ulang." };
  if (!id) return { error: "Data tidak valid." };
  try {
    await requireEffectiveSubscription(ctx.businessId, "write");
    await deletePhotobox(ctx.user.id, ctx.businessId, id);
  } catch (error) {
    return toFormState(error, "Gagal menghapus photobox. Coba lagi.");
  }
  revalidatePath("/dashboard/photoboxes");
  return { error: undefined };
}
