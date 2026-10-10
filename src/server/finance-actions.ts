"use server";

/**
 * Server actions finance (expenses, transaksi manual) — docs/04 §4.4, §4.5.
 * Staff actions ada di staff-actions.ts (docs/04 §4.13).
 */

import { revalidatePath } from "next/cache";
import { num, str, toFormState } from "@/lib/form-state";
import { requireActiveBusiness } from "@/server/action-utils";
import { requireEffectiveSubscription } from "@/server/require-subscription";
import type { FormState } from "@/server/auth-actions";
import {
  createExpense,
  deleteExpense,
  updateExpense,
} from "@/server/finance";
import { createManualTransaction } from "@/server/transactions";
import { EXPENSE_CATEGORIES } from "@/lib/validators";

// --- EXPENSES (docs/04 §4.4) ---

function expenseInput(formData: FormData) {
  return {
    category: EXPENSE_CATEGORIES.includes(str(formData, "category") as (typeof EXPENSE_CATEGORIES)[number])
      ? (str(formData, "category") as (typeof EXPENSE_CATEGORIES)[number])
      : "other",
    amount: num(formData, "amount"),
    note: str(formData, "note") || undefined,
    expense_date: str(formData, "expense_date"),
    outlet_id: str(formData, "outlet_id") || null,
  };
}

export async function createExpenseAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const ctx = await requireActiveBusiness();
  if (!ctx) return { error: "Sesi berakhir. Silakan login ulang." };
  await requireEffectiveSubscription(ctx.businessId, "write");
  try {
    await createExpense(ctx.user.id, ctx.businessId, expenseInput(formData));
  } catch (error) {
    return toFormState(error);
  }
  revalidatePath("/dashboard/finance");
  return { error: undefined };
}

export async function updateExpenseAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const ctx = await requireActiveBusiness();
  if (!ctx) return { error: "Sesi berakhir. Silakan login ulang." };
  await requireEffectiveSubscription(ctx.businessId, "write");
  const id = str(formData, "id");
  if (!id) return { error: "Expense tidak valid" };
  try {
    await updateExpense(ctx.user.id, ctx.businessId, id, expenseInput(formData));
  } catch (error) {
    return toFormState(error);
  }
  revalidatePath("/dashboard/finance");
  return { error: undefined };
}

export async function deleteExpenseAction(formData: FormData): Promise<void> {
  const ctx = await requireActiveBusiness();
  const id = String(formData.get("id") ?? "");
  if (!ctx || !id) return;
  try {
    await requireEffectiveSubscription(ctx.businessId, "write");
    await deleteExpense(ctx.user.id, ctx.businessId, id);
  } catch {
    // ponytail: void form action tak bisa menampilkan error; gagal ditelan
    // agar tidak jadi unhandled rejection.
    return;
  }
  revalidatePath("/dashboard/finance");
}

// --- TRANSAKSI MANUAL (docs/04 §4.5) ---

export async function createManualTxAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const ctx = await requireActiveBusiness();
  if (!ctx) return { error: "Sesi berakhir. Silakan login ulang." };
  try {
    await requireEffectiveSubscription(ctx.businessId, "write");
    await createManualTransaction(ctx.user.id, ctx.businessId, {
      outlet_id: str(formData, "outlet_id"),
      photobox_id: str(formData, "photobox_id"),
      package_id: str(formData, "package_id") || null,
      // Metode selalu 'manual' (backend source of truth) — nilai form diabaikan.
      payment_method: "manual",
      gross_amount: num(formData, "gross_amount"),
      discount_amount: num(formData, "discount_amount") || 0,
    });
  } catch (error) {
    return toFormState(error);
  }
  revalidatePath("/dashboard/transactions");
  revalidatePath("/dashboard");
  return { error: undefined };
}

