"use server";

/**
 * Server actions POS — docs/pos/03 §6.
 * Binding tipis: auth → business aktif (cookie) → delegate pos-products/pos-orders.
 * businessId SELALU dari cookie snapyos_active_business, bukan param client (A8).
 */

import { revalidatePath } from "next/cache";

import { ApiError } from "@/lib/api-errors";
import { intOrNull, str, toFormState } from "@/lib/form-state";
import { requireActiveBusiness } from "@/server/action-utils";
import { requireEffectiveSubscription } from "@/server/require-subscription";
import type { FormState } from "@/server/auth-actions";
import {
  createPosProduct,
  updatePosProduct,
  deactivatePosProduct,
  setPosBoothEnabled,
} from "@/server/pos-products";
import {
  createPosOrder,
  cancelPosOrder,
  payPosOrderManually,
  type PosOrderDetail,
} from "@/server/pos-orders";
import type { PosOrderCreateInput, PosManualPayInput } from "@/lib/validators";

// --- MANAJEMEN PRODUK (owner/manager — pos:manage) ---

export async function posCreateProductAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const ctx = await requireActiveBusiness();
  if (!ctx) return { error: "Sesi berakhir. Silakan login ulang." };

  try {
    await requireEffectiveSubscription(ctx.businessId, "write");
    await createPosProduct(ctx.user.id, ctx.businessId, {
      name: str(formData, "name"),
      sku: str(formData, "sku") || null,
      category: str(formData, "category") || ("lainnya" as const),
      description: str(formData, "description") || null,
      price: Number(str(formData, "price") || "0") || 0,
      cost: intOrNull(formData, "cost"),
      stock: intOrNull(formData, "stock"),
      image_url: str(formData, "image_url") || null,
    });
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath("/dashboard/pos");
  return { error: undefined };
}

export async function posUpdateProductAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const ctx = await requireActiveBusiness();
  if (!ctx) return { error: "Sesi berakhir. Silakan login ulang." };

  const id = str(formData, "id");
  if (!id) return { error: "Produk tidak valid" };

  try {
    await requireEffectiveSubscription(ctx.businessId, "write");
    await updatePosProduct(ctx.user.id, ctx.businessId, {
      id,
      name: str(formData, "name") || undefined,
      sku: str(formData, "sku"),
      category: str(formData, "category") || undefined,
      description: str(formData, "description"),
      image_url: str(formData, "image_url"),
      price: str(formData, "price") === "" ? undefined : Number(str(formData, "price")) || 0,
      cost: intOrNull(formData, "cost"),
      stock: intOrNull(formData, "stock"),
    });
  } catch (error) {
    return toFormState(error);
  }

  revalidatePath("/dashboard/pos");
  return { error: undefined };
}

export async function posDeactivateProductAction(formData: FormData): Promise<FormState> {
  const ctx = await requireActiveBusiness();
  const id = String(formData.get("id") ?? "");
  if (!ctx) return { error: "Sesi berakhir. Silakan login ulang." };
  if (!id) return { error: "Data tidak valid." };
  try {
    await requireEffectiveSubscription(ctx.businessId, "write");
    await deactivatePosProduct(ctx.user.id, ctx.businessId, id);
  } catch (error) {
    return toFormState(error, "Gagal menonaktifkan produk. Coba lagi.");
  }
  revalidatePath("/dashboard/pos");
  return { error: undefined };
}

// --- TOGGLE BOOTH (owner/manager — pos:manage) ---

export async function posToggleBoothAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const ctx = await requireActiveBusiness();
  const photoboxId = String(formData.get("photoboxId") ?? "");
  const enabled = String(formData.get("enabled") ?? "") === "true";
  if (!ctx) return { error: "Sesi berakhir. Silakan login ulang." };
  if (!photoboxId) return { error: "Booth tidak valid." };
  try {
    await requireEffectiveSubscription(ctx.businessId, "write");
    await setPosBoothEnabled(ctx.user.id, ctx.businessId, photoboxId, enabled);
  } catch (error) {
    return toFormState(error, "Gagal mengatur booth POS. Coba lagi.");
  }
  revalidatePath("/dashboard/pos");
  revalidatePath("/pos");
  return {};
}

// --- TERMINAL KASIR (owner/manager/staff — pos:sell) ---

export async function posSubmitOrderAction(input: PosOrderCreateInput): Promise<PosOrderDetail> {
  const ctx = await requireActiveBusiness();
  if (!ctx) throw new ApiError("UNAUTHORIZED", "Sesi berakhir. Silakan login ulang.");
  await requireEffectiveSubscription(ctx.businessId, "write");
  return createPosOrder(ctx.user.id, ctx.businessId, input);
}

export async function posPayOrderAction(input: PosManualPayInput): Promise<{ orderId: string }> {
  const ctx = await requireActiveBusiness();
  if (!ctx) throw new ApiError("UNAUTHORIZED", "Sesi berakhir. Silakan login ulang.");
  await requireEffectiveSubscription(ctx.businessId, "write");
  return payPosOrderManually(ctx.user.id, ctx.businessId, input);
}

export async function posCancelOrderAction(input: { orderId: string }): Promise<void> {
  const ctx = await requireActiveBusiness();
  if (!ctx) throw new ApiError("UNAUTHORIZED", "Sesi berakhir. Silakan login ulang.");
  await requireEffectiveSubscription(ctx.businessId, "write");
  await cancelPosOrder(ctx.user.id, ctx.businessId, input.orderId);
}
