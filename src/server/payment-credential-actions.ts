"use server";

/**
 * Server actions payment gateway (owner) — docs/04 §4.9, docs/06 §6.5.
 * Wiring client → server module `src/server/payment-credentials.ts`
 * (UI dashboard payment restored 2026-09-18; direct merchant
 * midtrans/tripay = jalan utama, dana langsung ke rekening owner).
 */

import { revalidatePath } from "next/cache";

import { toFormState } from "@/lib/form-state";
import { getActiveBusiness, requireUser } from "@/lib/tenant";
import { rateLimit } from "@/lib/rate-limit";
import type { PaymentCredentialEnvironment } from "@/lib/payment-credentials";
import {
  createCredential as createCredentialServer,
  updateCredential as updateCredentialServer,
  deleteCredential as deleteCredentialServer,
  testCredential as testCredentialServer,
} from "@/server/payment-credentials";
import type { GatewayProvider } from "@/server/payment/providers/types";

const REVALIDATE = "/dashboard/payment";

export type PaymentCredentialActionResult =
  { ok: true } | { error: string; fieldErrors?: Record<string, string[]> };

export type CreateInput = {
  provider: GatewayProvider;
  environment: PaymentCredentialEnvironment;
  label: string | null;
  merchant_id: string;
  client_key: string | null;
  server_key: string;
  private_key?: string;
  is_active: boolean;
  enabled_methods: string[];
};

export type UpdateInput = {
  label?: string | null;
  merchant_id?: string;
  environment?: PaymentCredentialEnvironment;
  client_key?: string | null;
  server_key?: string;
  private_key?: string;
  is_active?: boolean;
  enabled_methods?: string[];
};

async function ownerContext(): Promise<{ userId: string; businessId: string } | null> {
  const user = await requireUser();
  if (!user) return null;
  const active = await getActiveBusiness(user.id);
  if (!active) return null;
  return { userId: user.id, businessId: active.business.id };
}

function fail(error: unknown): { error: string; fieldErrors?: Record<string, string[]> } {
  const state = toFormState(error, "Gagal mengelola payment gateway. Coba lagi.");
  const fieldErrors = state.fieldErrors;
  const hasFields = fieldErrors !== undefined && Object.keys(fieldErrors).length > 0;
  return {
    error: state.error ?? "Periksa kembali isian form. Coba lagi.",
    ...(hasFields ? { fieldErrors } : {}),
  };
}

export async function createCredentialAction(
  input: CreateInput
): Promise<PaymentCredentialActionResult> {
  const ctx = await ownerContext();
  if (!ctx) return { error: "Tidak punya izin untuk mengelola payment gateway" };
  try {
    await createCredentialServer(ctx.userId, ctx.businessId, input);
  } catch (error) {
    return fail(error);
  }
  revalidatePath(REVALIDATE);
  return { ok: true };
}

export async function updateCredentialAction(
  credentialId: string,
  input: UpdateInput
): Promise<PaymentCredentialActionResult> {
  const ctx = await ownerContext();
  if (!ctx) return { error: "Tidak punya izin untuk mengelola payment gateway" };
  try {
    await updateCredentialServer(ctx.userId, ctx.businessId, credentialId, input);
  } catch (error) {
    return fail(error);
  }
  revalidatePath(REVALIDATE);
  return { ok: true };
}

export async function deleteCredentialAction(
  credentialId: string
): Promise<PaymentCredentialActionResult> {
  const ctx = await ownerContext();
  if (!ctx) return { error: "Tidak punya izin untuk mengelola payment gateway" };
  try {
    await deleteCredentialServer(ctx.userId, ctx.businessId, credentialId);
  } catch (error) {
    return fail(error);
  }
  revalidatePath(REVALIDATE);
  return { ok: true };
}

export async function toggleCredentialAction(
  credentialId: string,
  isActive: boolean
): Promise<PaymentCredentialActionResult> {
  const ctx = await ownerContext();
  if (!ctx) return { error: "Tidak punya izin untuk mengelola payment gateway" };
  try {
    await updateCredentialServer(ctx.userId, ctx.businessId, credentialId, { is_active: isActive });
  } catch (error) {
    return fail(error);
  }
  revalidatePath(REVALIDATE);
  return { ok: true };
}

export async function testCredentialAction(
  credentialId: string
): Promise<{ ok: true; provider: string; environment: string } | { error: string }> {
  const ctx = await ownerContext();
  if (!ctx) return { error: "Tidak punya izin untuk mengelola payment gateway" };
  const limit = await rateLimit(`payment-credential-test:${ctx.userId}:${ctx.businessId}`, 3, 15 * 60_000);
  if (!limit.ok) return { error: "Terlalu banyak pengujian credential. Coba lagi nanti." };
  try {
    const result = await testCredentialServer(ctx.userId, ctx.businessId, credentialId);
    return { ok: true, provider: result.provider, environment: result.environment };
  } catch (error) {
    return fail(error);
  }
}
