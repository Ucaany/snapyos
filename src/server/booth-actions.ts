"use server";

/**
 * Server actions outlets & photoboxes — docs/12 Phase 3 UI.
 * Selalu scoped ke business aktif (cookie, divalidasi via membership).
 */

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { ApiError } from "@/lib/api-errors";
import { str, toFormState } from "@/lib/form-state";
import { verifyTurnstile } from "@/lib/turnstile";
import { getClientIp } from "@/lib/request-ip";
import { requireActiveBusiness } from "@/server/action-utils";
import { requireEffectiveSubscription } from "@/server/require-subscription";
import {
  createOutlet,
  deleteOutlet,
  updateOutlet,
} from "@/server/outlets";
import {
  createPhotobox,
  deletePhotobox,
  updatePhotobox,
  updatePhotoboxCameraConfig,
  updatePhotoboxBranding,
} from "@/server/photoboxes";
import type { FormState } from "@/server/auth-actions";

// --- OUTLETS ---

export async function createOutletAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
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

export async function updateOutletAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
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

export async function deleteOutletAction(formData: FormData): Promise<void> {
  const ctx = await requireActiveBusiness();
  const id = String(formData.get("id") ?? "");
  if (!ctx || !id) return;
  try {
    await requireEffectiveSubscription(ctx.businessId, "write");
    await deleteOutlet(ctx.user.id, ctx.businessId, id);
  } catch {
    // ponytail: void form action tak bisa menampilkan error; gagal ditelan
    // agar tidak jadi unhandled rejection.
    return;
  }
  revalidatePath("/dashboard/outlets");
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
  const unlimitedRetakes = formData.get("unlimited_retakes") === "on";
  return {
    name: str(formData, "name"),
    slug: str(formData, "slug") || undefined,
    outlet_id: formValue("outlet_id"),
    status: (str(formData, "status") || "offline") as "online" | "offline" | "maintenance",
    // PIN keluar kiosk (opsional) — hash sha256 di server; kosong = tidak diubah.
    exit_pin: str(formData, "exit_pin") || undefined,
    chroma_key_enabled: formData.get("chroma_key_enabled") === "on",
    payment_mode: (str(formData, "payment_mode") || null) as "gateway" | "voucher" | null,
    camera_settings: {
      countdown_seconds: number("countdown_seconds", 3),
      mirror_preview: formData.get("mirror_preview") === "on",
      fullscreen: formData.get("fullscreen") === "on",
      facingMode: str(formData, "facing_mode") === "user" ? "user" as const : "environment" as const,
      capture_width: number("capture_width", 1920),
      capture_height: number("capture_height", 1080),
      jpeg_quality: number("jpeg_quality", 0.92),
      rotation_degrees: number("rotation_degrees", 0),
      zoom: number("zoom", 1),
      screen_orientation:
        str(formData, "screen_orientation") === "portrait"
          ? ("portrait" as const)
          : ("landscape" as const),
    },
    session_settings: {
      timer_seconds: number("timer_seconds", 300),
      warning_seconds: number("warning_seconds", 60),
      max_retakes: unlimitedRetakes ? null : number("max_retakes", 1),
    },
    print_settings: {
      enabled: formData.get("print_enabled") === "on",
      paper_size: str(formData, "paper_size") === "A6" ? "A6" as const : "4x6" as const,
      layout: str(formData, "print_layout") === "strip" ? "strip" as const : "single" as const,
      orientation: str(formData, "orientation") === "landscape" ? "landscape" as const : "portrait" as const,
      auto_print: formData.get("auto_print") === "on",
      copies: number("copies", 1),
      margins_mm: number("margins_mm", 0),
    },
    // Perangkat (kamera/printer/display) tidak diisi manual —
    // auto-detect saat device pairing (docs/05 §5.0.1, Phase 4).
  };
}

async function createPhotoboxAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const ctx = await requireActiveBusiness();
  if (!ctx) return { error: "Sesi berakhir. Silakan login ulang." };
  await requireEffectiveSubscription(ctx.businessId, "write");

  // CAPTCHA (Turnstile) — hanya saat CREATE (bukan edit). Fail-closed di prod.
  const token = String(formData.get("cf-turnstile-response") ?? "");
  const ip = getClientIp(await headers());
  if (!(await verifyTurnstile(token, ip))) {
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

async function updatePhotoboxAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const ctx = await requireActiveBusiness();
  if (!ctx) return { error: "Sesi berakhir. Silakan login ulang." };
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

export async function savePhotoboxAction(
  prev: FormState,
  formData: FormData
): Promise<FormState> {
  const normalized = new FormData();
  for (const [key, value] of formData.entries()) {
    if (key === "0") continue;
    normalized.append(key.replace(/^_\d+_/, ""), value);
  }
  return str(normalized, "id")
    ? updatePhotoboxAction(prev, normalized)
    : createPhotoboxAction(prev, normalized);
}

export async function deletePhotoboxAction(formData: FormData): Promise<void> {
  const ctx = await requireActiveBusiness();
  const id = String(formData.get("id") ?? "");
  if (!ctx || !id) return;
  try {
    await requireEffectiveSubscription(ctx.businessId, "write");
    await deletePhotobox(ctx.user.id, ctx.businessId, id);
  } catch {
    // ponytail: void form action tak bisa menampilkan error; gagal ditelan
    // agar tidak jadi unhandled rejection.
    return;
  }
  revalidatePath("/dashboard/photoboxes");
}

// --- CAMERA TEST (owner) — docs/05 §5.5 ---

export type MirrorUpdate = { ok: boolean; mirror: boolean; error?: string };

/**
 * Toggle mirror_preview kiosk — persist ke camera_settings photobox.
 * Dipanggil langsung dari CameraTest (optimistic); client tidak dipercaya,
 * hasil server jadi source of truth.
 */
export async function setPhotoboxMirrorAction(
  photoboxId: string,
  mirror: boolean
): Promise<MirrorUpdate> {
  const ctx = await requireActiveBusiness();
  if (!ctx) return { ok: false, mirror, error: "Sesi berakhir. Login ulang." };
  await requireEffectiveSubscription(ctx.businessId, "write");
  if (!photoboxId) return { ok: false, mirror, error: "Photobox tidak valid" };

  try {
    await updatePhotoboxCameraConfig(ctx.user.id, ctx.businessId, photoboxId, {
      mirror_preview: mirror,
    });
  } catch (error) {
    const message =
      error instanceof ApiError ? error.message : "Gagal menyimpan pengaturan mirror.";
    return { ok: false, mirror, error: message };
  }

  revalidatePath(`/dashboard/photoboxes/${photoboxId}/camera`);
  return { ok: true, mirror };
}

// --- PER-BOOTH BRANDING OVERRIDE (0045) ---

/**
 * Simpan branding override per-booth. `branding: null`/kosong = reset ke inherit
 * global. Field dikirim sebagai objek `kiosk` (sama dengan brandingSchema);
 * merge server-side agar override parsial tidak menghapus field lain.
 */
export async function savePhotoboxBrandingAction(input: {
  photoboxId: string;
  branding: Record<string, unknown> | null;
}): Promise<{ ok: boolean; error?: string }> {
  const ctx = await requireActiveBusiness();
  if (!ctx) return { ok: false, error: "Sesi berakhir. Silakan login ulang." };
  await requireEffectiveSubscription(ctx.businessId, "write");
  if (!input.photoboxId) return { ok: false, error: "Photobox tidak valid" };

  try {
    await updatePhotoboxBranding(
      ctx.user.id,
      ctx.businessId,
      input.photoboxId,
      input.branding as Parameters<typeof updatePhotoboxBranding>[3]
    );
  } catch (error) {
    const message =
      error instanceof ApiError ? error.message : "Gagal menyimpan branding booth.";
    return { ok: false, error: message };
  }

  revalidatePath("/dashboard/branding");
  revalidatePath("/dashboard/photoboxes");
  return { ok: true };
}
