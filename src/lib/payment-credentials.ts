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
  /** Alasan konkret saat `webhook_url` null — ditampilkan di dashboard. */
  webhook_reason: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Satu-satunya daftar metode per provider — UI editor, validasi, dan kiosk
 * membaca dari sini. Hanya kanal yang benar-benar diimplementasikan adapter
 * (midtrans: qris/e-wallet/VA bank, tripay: closed payment, pakasir: qris).
 */
export const PAYMENT_METHODS = {
  midtrans: ["qris", "gopay", "shopeepay", "bca", "bni", "bri", "permata"],
  tripay: ["QRIS", "BCAVA", "BNIVA", "BRIVA", "MANDIRIVA", "PERMATAVA", "ALFAMART", "INDOMARET"],
  pakasir: ["qris"],
} as const satisfies Record<GatewayProvider, readonly string[]>;

/** Kode metode literal per provider — dasar peta tampilan yang ekshaustif. */
export type PaymentMethodCode<P extends GatewayProvider> = (typeof PAYMENT_METHODS)[P][number];

export type PaymentWebhookStatus = { url: string; reason: null } | { url: null; reason: string };

/** Diagnosa webhook: URL siap pakai atau sebab konkret kenapa belum ada. */
export function paymentWebhookStatus(provider: GatewayProvider): PaymentWebhookStatus {
  const configured = process.env.SnapyOS_PUBLIC_BASE_URL?.trim();
  if (!configured) {
    return {
      url: null,
      reason: "SnapyOS_PUBLIC_BASE_URL kosong — isi dengan URL publik SnapyOS.",
    };
  }
  let base: URL;
  try {
    base = new URL(configured);
  } catch {
    return {
      url: null,
      reason: "SnapyOS_PUBLIC_BASE_URL bukan URL valid (contoh: https://app.snapyos.id).",
    };
  }
  if (base.protocol !== "https:") {
    return {
      url: null,
      reason: `SnapyOS_PUBLIC_BASE_URL memakai ${base.protocol}// — webhook wajib HTTPS.`,
    };
  }
  return { url: new URL(`/api/webhooks/payment/${provider}`, base).toString(), reason: null };
}

/** Global callback routes resolve credentials exclusively from stored payments. */
export function paymentWebhookUrl(provider: GatewayProvider): string | null {
  return paymentWebhookStatus(provider).url;
}

/**
 * Semua provider dapat dites koneksi: Midtrans memakai create+cancel (adapter
 * verified), Pakasir & Tripay memakai probe status non-destruktif (getStatus
 * dengan reference dummy) yang tidak membuat transaksi yatim.
 */
export function canTestPaymentCredential(provider: GatewayProvider): boolean {
  return provider === "midtrans" || provider === "pakasir" || provider === "tripay";
}

/**
 * Midtrans test membuat transaksi nyata lalu membatalkannya — hanya aman di
 * sandbox. Pakasir/Tripay hanya membaca status, jadi aman di environment apa pun.
 */
export function canTestCredentialInEnvironment(
  provider: GatewayProvider,
  environment: PaymentCredentialEnvironment
): boolean {
  if (!canTestPaymentCredential(provider)) return false;
  return provider !== "midtrans" || environment === "sandbox";
}

/** Label field per provider — satu sumber untuk form dan pesan validasi. */
export type PaymentCredentialField =
  "merchant_id" | "server_key" | "client_key" | "private_key" | "webhook_secret";

export const PAYMENT_FIELD_LABELS: Record<
  GatewayProvider,
  Record<PaymentCredentialField, string | null>
> = {
  pakasir: {
    merchant_id: "Project Slug",
    server_key: "API Key",
    client_key: null,
    private_key: null,
    webhook_secret: "Webhook Secret",
  },
  midtrans: {
    merchant_id: "Merchant ID",
    server_key: "Server Key",
    client_key: "Client Key",
    private_key: null,
    webhook_secret: null,
  },
  tripay: {
    merchant_id: "Merchant Code",
    server_key: "API Key",
    client_key: null,
    private_key: "Private Key",
    webhook_secret: null,
  },
};

const FIELD_RULES: Record<
  GatewayProvider,
  Partial<Record<PaymentCredentialField, { pattern: RegExp; message: string }>>
> = {
  pakasir: {
    merchant_id: {
      pattern: /^[a-z0-9][a-z0-9-]{1,58}$/,
      message: "Project Slug Pakasir hanya huruf kecil, angka, dan tanda hubung",
    },
  },
  midtrans: {
    server_key: {
      pattern: /^(SB-Mid-server-|Mid-server-)/,
      message: "Server Key Midtrans harus diawali SB-Mid-server- (sandbox) atau Mid-server-",
    },
    client_key: {
      pattern: /^(SB-Mid-client-|Mid-client-)/,
      message: "Client Key Midtrans harus diawali SB-Mid-client- (sandbox) atau Mid-client-",
    },
  },
  tripay: {
    merchant_id: {
      pattern: /^[A-Za-z0-9-]{3,32}$/,
      message: "Merchant Code Tripay hanya huruf, angka, dan tanda hubung (contoh: T12345)",
    },
  },
};

/** Validasi format satu field credential; `null` = lolos. Pure, dipakai form + zod. */
export function validatePaymentField(
  provider: GatewayProvider,
  field: PaymentCredentialField,
  value: string
): string | null {
  const rule = FIELD_RULES[provider][field];
  if (!rule) return null;
  const trimmed = value.trim();
  if (!trimmed) return `${PAYMENT_FIELD_LABELS[provider][field]} wajib diisi`;
  return rule.pattern.test(trimmed) ? null : rule.message;
}

export function allowedPaymentMethods(
  provider: GatewayProvider,
  methods: readonly string[]
): string[] {
  const supported: readonly string[] = PAYMENT_METHODS[provider];
  return [...new Set(methods)].filter((method) => supported.includes(method));
}

/**
 * Gate tulis `metadata.enabled_methods`: minimal satu metode dan semuanya harus
 * didukung provider. Metode asing DITOLAK (bukan dibuang diam-diam) supaya
 * owner tahu ada pilihan yang tidak akan pernah muncul di kiosk.
 */
export function assertEnabledPaymentMethods(
  provider: GatewayProvider,
  methods: readonly string[]
): string[] {
  const supported: readonly string[] = PAYMENT_METHODS[provider];
  const unknown = methods.filter((method) => !supported.includes(method));
  if (unknown.length > 0) {
    throw new ApiError(
      "VALIDATION_ERROR",
      `Metode ${unknown.join(", ")} tidak didukung ${provider}. Pilihan valid: ${supported.join(", ")}.`
    );
  }
  const unique = [...new Set(methods)];
  if (unique.length === 0) {
    throw new ApiError(
      "VALIDATION_ERROR",
      `Pilih minimal satu metode pembayaran yang didukung ${provider}.`
    );
  }
  return unique;
}

/** Credential API projection. Secrets must never cross this boundary. */
export function redactPaymentCredential(row: PaymentCredentialStored): PaymentCredentialPublic {
  const enabled = Array.isArray(row.metadata?.enabled_methods)
    ? row.metadata.enabled_methods.filter((method): method is string => typeof method === "string")
    : [];
  const webhook = paymentWebhookStatus(row.provider);
  return {
    id: row.id,
    provider: row.provider,
    label: row.label,
    merchant_id: row.merchant_id,
    client_key: row.client_key,
    environment: row.environment,
    is_active: row.is_active,
    enabled_methods: allowedPaymentMethods(row.provider, enabled),
    webhook_url: webhook.url,
    webhook_reason: webhook.reason,
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

/** Error dari trigger DB 0091 saat batas 2 credential aktif dilanggar. */
export function isActiveCredentialLimitError(
  error: { code?: string | null; message?: string | null } | null
): boolean {
  if (!error) return false;
  return (
    error.code === "P0001" &&
    String(error.message ?? "").includes("ACTIVE_PAYMENT_CREDENTIAL_LIMIT")
  );
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
