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
 * Dekripsi server key credential. Credential yang tidak bisa didekripsi (key
 * dirotasi / payload terkorupsi) diperlakukan sebagai credential TIDAK ADA
 * (return null), bukan error fatal: satu credential rusak tidak mematikan
 * seluruh endpoint (metode tunai/voucher tetap jalan). Caller WAJIB gagal
 * eksplisit untuk metode gateway tersebut — TIDAK boleh pindah ke provider
 * lain, karena itu mengubah tujuan dana. Detail teknis di-log server-side
 * tanpa membocorkan plaintext.
 */
function tryDecrypt(payload: string, context: string): string | null {
  try {
    return decrypt(payload);
  } catch (error) {
    console.error(
      `[payment] credential ${context} tidak dapat didekripsi (dilewati):`,
      error instanceof Error ? error.message : String(error)
    );
    return null;
  }
}

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
    // Satu business boleh punya >1 credential aktif (unique per provider,
    // bukan per business). Tanpa tie-break, baris terpilih bergantung
    // updated_at → provider bisa berubah diam-diam antar request. Urutkan
    // provider dulu supaya pemilihan deterministik; updated_at hanya memilih
    // di antara baris provider yang sama (normalnya satu).
    .order("provider", { ascending: true })
    .order("updated_at", { ascending: false })
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
  const serverKey = tryDecrypt(row.server_key_encrypted, `aktif ${row.provider}/${row.environment}`); // NEVER log
  if (serverKey === null) return null;
  const metadata = { ...row.metadata };
  // Tripay: decrypt private_key_encrypted dari metadata jika ada.
  if (
    row.provider === "tripay" &&
    typeof metadata.private_key_encrypted === "string" &&
    metadata.private_key_encrypted
  ) {
    const privateKey = tryDecrypt(metadata.private_key_encrypted as string, `tripay private_key ${row.id}`);
    if (privateKey === null) return null;
    metadata.private_key = privateKey;
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
 * credential tidak ada / tidak bisa didekripsi. Caller TIDAK boleh fallback ke
 * provider lain (dana bisa masuk akun berbeda) — gagal eksplisit atau biarkan
 * status tetap pending sampai owner memperbaiki credential.
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
  const serverKey = tryDecrypt(row.server_key_encrypted, `by-id ${row.provider}/${row.environment}`);
  // Undecryptable (key dirotasi / payload rusak) → null, sesuai kontrak fungsi.
  // Caller (payment-create / qris) gagal eksplisit untuk metode ini — JANGAN
  // fallback ke resolveGateway(businessId): provider bisa berbeda → dana salah.
  if (serverKey === null) return null;
  const metadata = { ...row.metadata };
  if (
    row.provider === "tripay" &&
    typeof metadata.private_key_encrypted === "string" &&
    metadata.private_key_encrypted
  ) {
    const privateKey = tryDecrypt(metadata.private_key_encrypted as string, `tripay private_key ${row.id}`);
    if (privateKey === null) return null;
    metadata.private_key = privateKey;
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
