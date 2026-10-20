import { ApiError } from "./api-errors.ts";
import type { GatewayProvider } from "../server/payment/providers/types.ts";

export function assertPaymentCredentialOwner(role: "owner" | "manager" | "staff" | null): void {
  if (role === null) throw new ApiError("NOT_FOUND", "Business tidak ditemukan");
  if (role !== "owner")
    throw new ApiError("FORBIDDEN", "Hanya owner yang mengelola payment gateway");
}

export function assertPaymentCredentialTenant(
  row: { business_id: string } | null,
  businessId: string
): void {
  if (!row || row.business_id !== businessId) {
    throw new ApiError("NOT_FOUND", "Credential payment gateway tidak ditemukan");
  }
}

export type PaymentCredentialEnvironment = "sandbox" | "production";

/** Maksimum credential aktif per business (lintas environment). */
export const MAX_ACTIVE_PAYMENT_CREDENTIALS = 2;

export type PaymentCredentialStored = {
  id: string;
  business_id: string;
  provider: GatewayProvider;
  label: string | null;
  merchant_id: string;
  server_key_encrypted: string;
  client_key: string | null;
  environment: PaymentCredentialEnvironment;
  is_active: boolean;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type PaymentCredentialPublic = {
  id: string;
  provider: GatewayProvider;
  label: string | null;
  merchant_id: string;
  client_key: string | null;
  environment: PaymentCredentialEnvironment;
  is_active: boolean;
  enabled_methods: string[];
  webhook_url: string | null;
  created_at: string;
  updated_at: string;
};

export const PAYMENT_METHODS: Record<GatewayProvider, readonly string[]> = {
  midtrans: [
    "qris",
    "gopay",
    "shopeepay",
    "dana",
    "ovo",
    "bca",
    "bni",
    "bri",
    "mandiri",
    "permata",
    "alfamart",
    "indomaret",
  ],
  tripay: ["QRIS", "BCAVA", "BNIVA", "BRIVA", "MANDIRIVA", "PERMATAVA", "ALFAMART", "INDOMARET"],
  pakasir: ["qris"],
};

/** Global callback routes resolve credentials exclusively from stored payments. */
export function paymentWebhookUrl(provider: GatewayProvider): string | null {
  const configured = process.env.SnapyOS_PUBLIC_BASE_URL?.trim();
  if (!configured) return null;
  try {
    const base = new URL(configured);
    if (base.protocol !== "https:") return null;
    return new URL(`/api/webhooks/payment/${provider}`, base).toString();
  } catch {
    return null;
  }
}

/**
 * Semua provider dapat dites koneksi: Midtrans memakai create+cancel (adapter
 * verified), Pakasir & Tripay memakai probe status non-destruktif (getStatus
 * dengan reference dummy) yang tidak membuat transaksi yatim.
 */
export function canTestPaymentCredential(provider: GatewayProvider): boolean {
  return provider === "midtrans" || provider === "pakasir" || provider === "tripay";
}

export function allowedPaymentMethods(
  provider: GatewayProvider,
  methods: readonly string[]
): string[] {
  const supported = PAYMENT_METHODS[provider];
  return [...new Set(methods)].filter((method) => supported.includes(method));
}

/** Credential API projection. Secrets must never cross this boundary. */
export function redactPaymentCredential(row: PaymentCredentialStored): PaymentCredentialPublic {
  const enabled = Array.isArray(row.metadata?.enabled_methods)
    ? row.metadata.enabled_methods.filter((method): method is string => typeof method === "string")
    : [];
  return {
    id: row.id,
    provider: row.provider,
    label: row.label,
    merchant_id: row.merchant_id,
    client_key: row.client_key,
    environment: row.environment,
    is_active: row.is_active,
    enabled_methods: allowedPaymentMethods(row.provider, enabled),
    webhook_url: paymentWebhookUrl(row.provider),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Environment gateway aktif: PAYMENT_GATEWAY_ENV override, else NODE_ENV.
 * Dipakai registry (resolve credential) + payment-methods (kiosk list).
 */
export function gatewayEnvironment(): PaymentCredentialEnvironment {
  return (process.env.PAYMENT_GATEWAY_ENV ??
    (process.env.NODE_ENV === "production" ? "production" : "sandbox")) === "production"
    ? "production"
    : "sandbox";
}

/** Tolak aktivasi saat sudah mencapai batas credential aktif. */
export function assertActiveCredentialLimit(
  activeCount: number,
  max: number = MAX_ACTIVE_PAYMENT_CREDENTIALS
): void {
  if (activeCount >= max) {
    throw new ApiError(
      "VALIDATION_ERROR",
      `Maksimal ${max} payment gateway aktif sekaligus. Nonaktifkan satu untuk mengaktifkan yang lain.`
    );
  }
}
