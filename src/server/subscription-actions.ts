"use server"

/**
 * Server actions subscription owner — docs/12 Phase 10.
 * Mutasi owner-only (enforce di @/server/subscription).
 */

import { revalidatePath } from "next/cache"

import { str, toFormState } from "@/lib/form-state"
import { requireActiveBusiness } from "@/server/action-utils"
import {
  cancelSubscription,
  cancelAddOn,
  createSubscriptionInvoice,
  resumeSubscription,
} from "@/server/subscription"
import { previewSubscriptionPromo } from "@/server/subscription-promo"
import { createInvoiceQris, getInvoicePaymentStatus } from "@/server/payment/invoice"
import type { InvoiceQrisResult } from "@/lib/payment-contracts"
import type { FormState } from "@/server/auth-actions"

function refresh() {
  revalidatePath("/dashboard/subscription")
  revalidatePath("/dashboard")
}

export type CheckoutInput = {
  planCode?: string
  addOns?: { id: string; qty: number }[]
  promoCode?: string
}

/** Konfirmasi checkout (modal) → invoice pending terbit → client redirect bayar. */
export async function confirmSubscriptionCheckoutAction(
  input: CheckoutInput
): Promise<{ error?: string; invoiceId?: string }> {
  const ctx = await requireActiveBusiness()
  if (!ctx) return { error: "Sesi berakhir. Silakan login ulang." }
  try {
    const { invoiceId } = await createSubscriptionInvoice(ctx.user.id, ctx.businessId, input)
    refresh()
    return { invoiceId }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Checkout gagal. Coba lagi." }
  }
}

/** Pratinjau diskon promo di layar konfirmasi (tanpa memakai kuota). */
export async function previewSubscriptionPromoAction(
  code: string,
  grossAmount: number
): Promise<{ error?: string; code?: string; discount?: number }> {
  const ctx = await requireActiveBusiness()
  if (!ctx) return { error: "Sesi berakhir. Silakan login ulang." }
  try {
    return await previewSubscriptionPromo(code, grossAmount)
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Promo tidak valid." }
  }
}

export async function cancelSubscriptionAction(
  _prev: FormState,
  _formData: FormData
): Promise<FormState> {
  const ctx = await requireActiveBusiness()
  if (!ctx) return { error: "Sesi berakhir. Silakan login ulang." }
  try {
    await cancelSubscription(ctx.user.id, ctx.businessId)
  } catch (error) {
    return toFormState(error, "Gagal membatalkan subscription. Coba lagi.")
  }
  refresh()
  return {}
}

export async function resumeSubscriptionAction(
  _prev: FormState,
  _formData: FormData
): Promise<FormState> {
  const ctx = await requireActiveBusiness()
  if (!ctx) return { error: "Sesi berakhir. Silakan login ulang." }
  try {
    await resumeSubscription(ctx.user.id, ctx.businessId)
  } catch (error) {
    return toFormState(error, "Gagal melanjutkan langganan. Coba lagi.")
  }
  refresh()
  return {}
}

export async function cancelAddOnAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const ctx = await requireActiveBusiness()
  if (!ctx) return { error: "Sesi berakhir. Silakan login ulang." }
  try {
    await cancelAddOn(ctx.user.id, ctx.businessId, str(formData, "add_on_id"))
  } catch (error) {
    return toFormState(error, "Gagal membatalkan add-on. Coba lagi.")
  }
  refresh()
  return {}
}

export async function createInvoiceQrisAction(
  invoiceId: string
): Promise<{ error?: string; data?: InvoiceQrisResult }> {
  const ctx = await requireActiveBusiness()
  if (!ctx) return { error: "Sesi berakhir. Silakan login ulang." }
  try {
    return { data: await createInvoiceQris(ctx.user.id, ctx.businessId, invoiceId) }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Gagal membuat QRIS. Coba lagi." }
  }
}

export async function invoicePaymentStatusAction(
  invoiceId: string
): Promise<{ error?: string; status?: string }> {
  const ctx = await requireActiveBusiness()
  if (!ctx) return { error: "Sesi berakhir. Silakan login ulang." }
  try {
    const { status } = await getInvoicePaymentStatus(ctx.user.id, ctx.businessId, invoiceId)
    return { status }
  } catch {
    return { error: "Gagal mengecek status pembayaran." }
  }
}
