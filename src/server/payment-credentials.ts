import "server-only";

import { randomBytes } from "node:crypto";

import { ApiError } from "@/lib/api-errors";
import {
  assertPaymentCredentialOwner,
  assertPaymentCredentialTenant,
  assertActiveCredentialLimit,
  canTestPaymentCredential,
  redactPaymentCredential,
  type PaymentCredentialPublic,
  type PaymentCredentialStored,
} from "@/lib/payment-credentials";
import { getMembership } from "@/lib/tenant";
import {
  paymentCredentialCreateSchema,
  paymentCredentialUpdateSchema,
  type PaymentCredentialCreateInput,
  type PaymentCredentialUpdateInput,
} from "@/lib/validators";
import { createServerClient } from "@/lib/supabase/server";
import { decrypt, encrypt } from "@/server/payment/providers/encrypt";
import { credentialMetadata } from "@/server/payment-credentials-codec";
import { resolveGatewayFromCredential } from "@/server/payment/providers/gateway-factory";
import { requireFeature } from "@/server/feature-gate";
import type { GatewayCredential } from "@/server/payment/providers/types";

const CREDENTIAL_FIELDS = "id, business_id, provider, label, merchant_id, server_key_encrypted, client_key, environment, is_active, metadata, created_at, updated_at";

/**
 * Encrypt dengan pesan yang jelas: raw Error dari requireEncryptionKey
 * (PAYMENT_ENCRYPTION_KEY kosong/format salah) diubah jadi ApiError agar UI
 * menampilkan penyebab nyata, bukan fallback generik "Gagal mengelola".
 */
function encryptCredential(plaintext: string): string {
  try {
    return encrypt(plaintext);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Enkripsi gagal";
    throw new ApiError("INTERNAL", message);
  }
}

async function requireOwner(userId: string, businessId: string) {
  const membership = await getMembership(userId, businessId);
  assertPaymentCredentialOwner(membership?.role ?? null);
}

function row(value: unknown): PaymentCredentialStored {
  return value as PaymentCredentialStored;
}

function gatewayCredential(stored: PaymentCredentialStored): GatewayCredential {
  const metadata = { ...(stored.metadata ?? {}) };
  if (stored.provider === "tripay") {
    if (typeof metadata.private_key_encrypted !== "string") {
      throw new ApiError("VALIDATION_ERROR", "Credential Tripay tidak memiliki private key");
    }
    metadata.private_key = decrypt(metadata.private_key_encrypted);
    delete metadata.private_key_encrypted;
  }
  return {
    id: stored.id,
    provider: stored.provider,
    merchantId: stored.merchant_id,
    serverKey: decrypt(stored.server_key_encrypted),
    clientKey: stored.client_key,
    environment: stored.environment,
    metadata,
  };
}

export async function listCredentials(userId: string, businessId: string): Promise<PaymentCredentialPublic[]> {
  await requireOwner(userId, businessId);
  const { data, error } = await createServerClient()
    .from("payment_credentials")
    .select(CREDENTIAL_FIELDS)
    .eq("business_id", businessId)
    .order("provider")
    .order("environment");
  if (error) throw new ApiError("INTERNAL", "Gagal memuat payment gateway");
  return (data ?? []).map((item) => redactPaymentCredential(row(item)));
}

export async function createCredential(userId: string, businessId: string, input: PaymentCredentialCreateInput) {
  await requireOwner(userId, businessId);
  await requireFeature(businessId, "direct_payment");
  const parsed = paymentCredentialCreateSchema.parse(input);
  if (parsed.is_active !== false) {
    const supabase = createServerClient();
    const { count } = await supabase
      .from("payment_credentials")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .eq("is_active", true);
    assertActiveCredentialLimit(count ?? 0);
  }
  const { data, error } = await createServerClient()
    .from("payment_credentials")
    .insert({
      business_id: businessId,
      provider: parsed.provider,
      label: parsed.label ?? null,
      merchant_id: parsed.merchant_id,
      server_key_encrypted: encryptCredential(parsed.server_key),
      client_key: parsed.client_key ?? null,
      environment: parsed.environment,
      is_active: parsed.is_active ?? true,
      metadata: credentialMetadata(parsed),
    })
    .select(CREDENTIAL_FIELDS)
    .single();
  if (error || !data) {
    if (error?.code === "23505") throw new ApiError("VALIDATION_ERROR", "Credential provider dan environment ini sudah ada");
    throw new ApiError("INTERNAL", "Gagal menyimpan payment gateway");
  }
  return redactPaymentCredential(row(data));
}


export async function updateCredential(userId: string, businessId: string, credentialId: string, input: PaymentCredentialUpdateInput) {
  await requireOwner(userId, businessId);
  await requireFeature(businessId, "direct_payment");
  const parsed = paymentCredentialUpdateSchema.parse(input);
  const supabase = createServerClient();
  const { data: current } = await supabase
    .from("payment_credentials")
    .select(CREDENTIAL_FIELDS)
    .eq("id", credentialId)
    .eq("business_id", businessId)
    .maybeSingle();
  const existing = row(current);
  assertPaymentCredentialTenant(existing, businessId);
  const provider = parsed.provider ?? existing.provider;
  if (parsed.provider !== undefined && parsed.provider !== existing.provider) {
    throw new ApiError("VALIDATION_ERROR", "Provider credential tidak dapat diubah");
  }
  // Batas 2 aktif: hanya dicek saat aktivasi (is_active → true), bukan saat edit field lain.
  if (parsed.is_active === true) {
    const { count } = await supabase
      .from("payment_credentials")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .eq("is_active", true)
      .neq("id", credentialId);
    assertActiveCredentialLimit(count ?? 0);
  }
  const { data, error } = await supabase
    .from("payment_credentials")
    .update({
      ...(parsed.label !== undefined ? { label: parsed.label } : {}),
      ...(parsed.merchant_id !== undefined ? { merchant_id: parsed.merchant_id } : {}),
      ...(parsed.client_key !== undefined ? { client_key: parsed.client_key } : {}),
      ...(parsed.environment !== undefined ? { environment: parsed.environment } : {}),
      ...(parsed.is_active !== undefined ? { is_active: parsed.is_active } : {}),
      ...(parsed.server_key !== undefined ? { server_key_encrypted: encryptCredential(parsed.server_key) } : {}),
      ...(parsed.enabled_methods !== undefined || parsed.private_key !== undefined || parsed.webhook_secret !== undefined
        ? { metadata: credentialMetadata({ provider, enabled_methods: parsed.enabled_methods, private_key: parsed.private_key, webhook_secret: parsed.webhook_secret }, existing.metadata) }
        : {}),
    })
    .eq("id", credentialId)
    .eq("business_id", businessId)
    .select(CREDENTIAL_FIELDS)
    .single();
  if (error || !data) {
    if (error?.code === "23505") throw new ApiError("VALIDATION_ERROR", "Credential provider dan environment ini sudah ada");
    throw new ApiError("INTERNAL", "Gagal memperbarui payment gateway");
  }
  return redactPaymentCredential(row(data));
}

export async function deleteCredential(userId: string, businessId: string, credentialId: string) {
  await requireOwner(userId, businessId);
  await requireFeature(businessId, "direct_payment");
  const { data, error } = await createServerClient()
    .from("payment_credentials")
    .delete()
    .eq("id", credentialId)
    .eq("business_id", businessId)
    .select("id")
    .maybeSingle();
  if (error) throw new ApiError("INTERNAL", "Gagal menghapus payment gateway");
  if (!data) throw new ApiError("NOT_FOUND", "Credential payment gateway tidak ditemukan");
}

export async function testCredential(userId: string, businessId: string, credentialId: string) {
  await requireOwner(userId, businessId);
  await requireFeature(businessId, "direct_payment");
  const { data } = await createServerClient()
    .from("payment_credentials")
    .select(CREDENTIAL_FIELDS)
    .eq("id", credentialId)
    .eq("business_id", businessId)
    .maybeSingle();
  const stored = row(data);
  assertPaymentCredentialTenant(stored, businessId);
  if (stored.environment !== "sandbox") {
    throw new ApiError("VALIDATION_ERROR", "Test koneksi hanya tersedia untuk credential sandbox");
  }
  if (!canTestPaymentCredential(stored.provider)) {
    throw new ApiError("VALIDATION_ERROR", "Tes otomatis belum tersedia untuk provider ini karena transaksi sandbox tidak bisa dibatalkan dengan aman.");
  }
  const gateway = resolveGatewayFromCredential(gatewayCredential(stored));
  // Probe non-destruktif untuk Pakasir/Tripay (tanpa cancel adapter): panggil
  // getStatus dengan reference dummy — verifikasi auth + konektivitas tanpa
  // membuat transaksi yang yatim. Midtrans memakai create + cancel (di bawah).
  if (stored.provider !== "midtrans") {
    try {
      await gateway.getStatus("SnapyOS-TESTCONNECT", 1, null);
    } catch {
      throw new ApiError("VALIDATION_ERROR", "Koneksi gateway gagal. Periksa credential dan environment.");
    }
    return { ok: true, provider: stored.provider, environment: stored.environment };
  }
  if (!gateway.cancelTransaction) {
    throw new ApiError("VALIDATION_ERROR", "Provider tidak mendukung pembatalan transaksi uji.");
  }
  const orderId = `SnapyOS-TEST${randomBytes(8).toString("hex").toUpperCase()}`;
  try {
    const result = await gateway.createTransaction({
      orderId,
      amount: 1,
      description: "SnapyOS credential connection test",
      callbackUrl: "https://snapyos.invalid/payment-test",
    });
    if (result.orderId !== orderId || result.amount !== 1 || !(await gateway.cancelTransaction(orderId))) {
      throw new Error("Provider gagal membuat atau membatalkan transaksi uji");
    }
  } catch {
    throw new ApiError("VALIDATION_ERROR", "Koneksi gateway gagal. Periksa credential dan environment.");
  }
  return { ok: true, provider: stored.provider, environment: stored.environment };
}
