"use server";

/**
 * Server actions pembelian template premium — docs/15 §15.9b.
 * Owner: beli template → invoice pending → redirect ke halaman bayar invoice
 * (reuse /dashboard/subscription/invoice/[id]).
 */

import { revalidatePath } from "next/cache";
import { requireActiveBusiness } from "@/server/action-utils";
import { requireEffectiveSubscription } from "@/server/require-subscription";
import { purchaseTemplate } from "@/server/template-purchase";

export async function purchaseTemplateAction(
  templateId: string
): Promise<{ error?: string; invoiceId?: string }> {
  const ctx = await requireActiveBusiness();
  if (!ctx) return { error: "Sesi berakhir. Silakan login ulang." };
  try {
    // Gate lifecycle tunggal (docs/02 §2.4), paritas dengan write-action lain
    // (staff/booth/catalog): bisnis kedaluwarsa tidak boleh membuat invoice baru.
    await requireEffectiveSubscription(ctx.businessId, "write");
    const { invoiceId } = await purchaseTemplate(ctx.user.id, ctx.businessId, templateId);
    revalidatePath("/dashboard/templates");
    revalidatePath("/dashboard");
    return { invoiceId };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Pembelian gagal. Coba lagi." };
  }
}
