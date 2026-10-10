"use server";

import { revalidatePath } from "next/cache";
import { toFormState, str } from "@/lib/form-state";
import type { FormState } from "@/server/auth-actions";
import { submitSupportTicket } from "@/server/support-tickets";

/**
 * Server actions tiket bantuan owner — docs/04 §4.20.
 * Membungkus data layer (server/support-tickets.ts) menjadi FormState.
 */

export async function submitSupportTicketAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  try {
    await submitSupportTicket({
      subject: str(formData, "subject"),
      category: str(formData, "category"),
      area: str(formData, "area"),
      description: str(formData, "description"),
    });
  } catch (error) {
    return toFormState(error);
  }
  revalidatePath("/dashboard/support");
  return { error: undefined };
}

export async function replySupportTicketAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const ticketId = str(formData, "ticketId");
  const body = str(formData, "body");
  try {
    const { replySupportTicket } = await import("@/server/support-tickets");
    await replySupportTicket(ticketId, body);
  } catch (error) {
    return toFormState(error);
  }
  revalidatePath(`/dashboard/support/${ticketId}`);
  revalidatePath("/dashboard/support");
  return { error: undefined };
}
