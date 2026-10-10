/**
 * Gateway registry — Phase 1 (electron-kiosk-plan §Phase 1).
 * Resolve PaymentGateway dari credential DB atau fallback aggregator (env var).
 *
 * Logika:
 *   1. SELECT payment_credentials WHERE business_id AND is_active AND environment match
 *   2. Decrypt server_key (+ metadata.private_key_encrypted untuk Tripay)
 *   3. Instantiate adapter
 *   4. Tidak ada credential aktif → return null → caller fallback aggregator
 *
 * Tidak ada cross-request cache (staleness credential = risiko security).
 * Server key TIDAK dikembalikan ke caller; hanya diteruskan ke adapter factory.
 */

import "server-only";
import { createServerClient } from "@/lib/supabase/server";
import { gatewayEnvironment } from "@/lib/payment-credentials";
import { decrypt } from "./encrypt";
import { resolveGatewayFromCredential } from "./gateway-factory";
import type { GatewayCredential, PaymentGateway } from "./types";

const GLOBAL_ENABLED_KEY: Record<string, string> = {
  pakasir: "gateway_pakasir_enabled",
  midtrans: "gateway_midtrans_enabled",
  tripay: "gateway_tripay_enabled",
};

/**
 * Cek apakah provider di-enable global oleh admin platform.
 * Default true (enabled) bila key belum ada — backward compatible.
 */
async function isProviderGloballyEnabled(provider: string): Promise<boolean> {
  const key = GLOBAL_ENABLED_KEY[provider];
  if (!key) return true;
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("platform_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error) return true;
  const v = (data as { value?: unknown } | null)?.value;
  return v === undefined ? true : v === true;
}

/**
 * Resolve credential aktif per business.
 * Return null bila tidak ada credential aktif (bukan throw) → caller fallback aggregator.
 */
export async function resolveCredential(businessId: string): Promise<GatewayCredential | null> {
  const supabase = createServerClient();
  const env = gatewayEnvironment();
  const { data } = await supabase
    .from("payment_credentials")
    .select("id, provider, merchant_id, server_key_encrypted, client_key, environment, metadata")
    .eq("business_id", businessId)
    .eq("is_active", true)
    .eq("environment", env)
    .order("updated_at", { ascending: false })
    // Schema permits one active credential per provider/environment, not one
    // provider total. Deterministic newest row preserves registry fallback.
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const row = data as {
    id: string;
    provider: string;
    merchant_id: string;
    server_key_encrypted: string;
    client_key: string | null;
    environment: string;
    metadata: Record<string, unknown>;
  };
  // Global provider toggle: nonaktif → anggap tak ada credential (fallback
  // aggregator), sehingga checkout tetap berjalan tanpa provider ini.
  if (!(await isProviderGloballyEnabled(row.provider))) return null;
  const serverKey = decrypt(row.server_key_encrypted); // NEVER log
  const metadata = { ...row.metadata };
  // Tripay: decrypt private_key_encrypted dari metadata jika ada.
  if (
    row.provider === "tripay" &&
    typeof metadata.private_key_encrypted === "string" &&
    metadata.private_key_encrypted
  ) {
    metadata.private_key = decrypt(metadata.private_key_encrypted as string);
    delete metadata.private_key_encrypted;
  }
  return {
    id: row.id,
    provider: row.provider as GatewayCredential["provider"],
    merchantId: row.merchant_id,
    serverKey,
    clientKey: row.client_key,
    environment: row.environment as GatewayCredential["environment"],
    metadata,
  };
}

/**
 * Resolve PaymentGateway dari business_id.
 * Credential aktif → direct merchant adapter.
 * Tidak ada credential → Pakasir aggregator (env var fallback).
 */
export async function resolveGateway(businessId: string): Promise<PaymentGateway> {
  const credential = await resolveCredential(businessId);
  return resolveGatewayFromCredential(credential);
}

/**
 * Resolve PaymentGateway dari credential_id (dipakai saat payment sudah tercatat
 * dengan credential_id tertentu, misal di expireStaleCheckouts). Null bila
 * credential tidak ada, agar caller dapat fallback dengan resolveGateway(businessId).
 */
export async function resolveGatewayByCredential(
  credentialId: string
): Promise<PaymentGateway | null> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("payment_credentials")
    .select("id, provider, merchant_id, server_key_encrypted, client_key, environment, metadata")
    .eq("id", credentialId)
    .maybeSingle();
  if (!data) return null;
  const row = data as {
    id: string;
    provider: string;
    merchant_id: string;
    server_key_encrypted: string;
    client_key: string | null;
    environment: string;
    metadata: Record<string, unknown>;
  };
  const serverKey = decrypt(row.server_key_encrypted);
  const metadata = { ...row.metadata };
  if (
    row.provider === "tripay" &&
    typeof metadata.private_key_encrypted === "string" &&
    metadata.private_key_encrypted
  ) {
    metadata.private_key = decrypt(metadata.private_key_encrypted as string);
    delete metadata.private_key_encrypted;
  }
  return resolveGatewayFromCredential({
    id: row.id,
    provider: row.provider as GatewayCredential["provider"],
    merchantId: row.merchant_id,
    serverKey,
    clientKey: row.client_key,
    environment: row.environment as GatewayCredential["environment"],
    metadata,
  });
}
