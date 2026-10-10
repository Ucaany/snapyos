"use server";

import { revalidatePath } from "next/cache";
import { requireActiveBusiness } from "@/server/action-utils";
import { requireEffectiveSubscription } from "@/server/require-subscription";
import { ApiError } from "@/lib/api-errors";
import { confirmCashPaymentByOperator } from "@/server/cash-payment";

export type CashConfirmResult = { ok: boolean; error?: string; code?: string };

/** Konfirmasi pembayaran tunai kiosk dari dashboard owner/manager/staff. */
export async function confirmCashPaymentAction(
  paymentReference: string
): Promise<CashConfirmResult> {
  const ctx = await requireActiveBusiness();
  if (!ctx) return { ok: false, error: "Sesi berakhir. Silakan login ulang." };
  try {
    // C3 (security): mutasi finansial WAJIB lewat gate lifecycle tunggal —
    // tanpa ini bisnis kedaluwarsa bisa menyettle tunai (transactions baru).
    await requireEffectiveSubscription(ctx.businessId, "write");
    await confirmCashPaymentByOperator(ctx.user.id, ctx.businessId, paymentReference);
  } catch (error) {
    const code = error instanceof ApiError ? error.code : undefined;
    return {
      ok: false,
      ...(code ? { code } : {}),
      error: error instanceof Error ? error.message : "Gagal mengonfirmasi tunai.",
    };
  }
  revalidatePath("/dashboard");
  revalidatePath("/staff");
  return { ok: true };
}
