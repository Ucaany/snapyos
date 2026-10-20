import "server-only";

import {
  allowedPaymentMethods,
  gatewayEnvironment,
  paymentWebhookUrl,
} from "@/lib/payment-credentials";
import {
  buildKioskPaymentMethods,
  filterKioskPaymentMethods,
  paymentMethodId,
  type KioskPaymentMethod,
  type PhotoboxPaymentMode,
} from "@/server/payment/kiosk-payment";
import { createServerClient } from "@/lib/supabase/server";
import { hasFeature } from "@/server/feature-gate";

export type KioskCredential = {
  id: string;
  provider: "midtrans" | "tripay" | "pakasir";
  enabledMethods: string[];
};

function kioskSupported(
  provider: "midtrans" | "tripay" | "pakasir",
  methods: readonly string[]
): string[] {
  const supported =
    provider === "midtrans"
      ? new Set(["qris", "gopay", "shopeepay", "bca", "bni", "bri", "permata"])
      : provider === "pakasir"
        ? new Set(["qris"])
        : new Set([
            "QRIS",
            "BCAVA",
            "BNIVA",
            "BRIVA",
            "MANDIRIVA",
            "PERMATAVA",
            "ALFAMART",
            "INDOMARET",
          ]);
  return methods.filter((method) => supported.has(method));
}

export async function listKioskCredentials(businessId: string): Promise<KioskCredential[]> {
  const { data } = await createServerClient()
    .from("payment_credentials")
    .select("id, provider, metadata")
    .eq("business_id", businessId)
    .eq("is_active", true)
    .eq("environment", gatewayEnvironment())
    .in("provider", ["midtrans", "tripay", "pakasir"]);
  return (data ?? []).flatMap((row) => {
    if (row.provider !== "midtrans" && row.provider !== "tripay" && row.provider !== "pakasir")
      return [];
    // Pakasir verifikasi via server-to-server (webhook route aggregator-only); tidak butuh URL tampilan.
    if (row.provider !== "pakasir" && !paymentWebhookUrl(row.provider)) return [];
    const raw = (row.metadata as { enabled_methods?: unknown } | null)?.enabled_methods;
    const enabled = Array.isArray(raw)
      ? raw.filter((value): value is string => typeof value === "string")
      : [];
    const enabledMethods = kioskSupported(
      row.provider,
      allowedPaymentMethods(row.provider, enabled)
    );
    return enabledMethods.length > 0
      ? [{ id: row.id, provider: row.provider, enabledMethods }]
      : [];
  });
}

async function getPhotoboxPaymentMode(photoboxId: string): Promise<PhotoboxPaymentMode> {
  const { data } = await createServerClient()
    .from("photoboxes")
    .select("payment_mode")
    .eq("id", photoboxId)
    .maybeSingle();
  const mode = (data as { payment_mode?: "gateway" | "voucher" | null } | null)?.payment_mode;
  return mode ?? null;
}

export async function listKioskPaymentMethods(
  businessId: string,
  photoboxId: string
): Promise<KioskPaymentMethod[]> {
  const credentials = await listKioskCredentials(businessId);
  const methods = filterKioskPaymentMethods(
    buildKioskPaymentMethods(credentials),
    await getPhotoboxPaymentMode(photoboxId)
  );
  if (!(await hasFeature(businessId, "cash_payment"))) {
    return methods.filter((method) => method.id !== "cash");
  }
  return methods;
}

export async function resolveKioskPaymentMethod(
  businessId: string,
  photoboxId: string,
  methodId: string
): Promise<{
  method: KioskPaymentMethod;
  credentialId: string | null;
}> {
  const methods = await listKioskPaymentMethods(businessId, photoboxId);
  const method = methods.find((candidate) => candidate.id === methodId);
  if (!method) throw new Error("Metode pembayaran tidak tersedia");
  // Cash + voucher tidak butuh credential merchant — provider null.
  if (method.kind === "cash" || method.kind === "voucher") {
    return { method, credentialId: null };
  }
  const credentials = await listKioskCredentials(businessId);
  const credential = credentials.find(
    (candidate) =>
      method.provider === candidate.provider &&
      paymentMethodId(candidate.provider, method.method ?? "") === method.id
  );
  if (!credential) throw new Error("Credential payment tidak tersedia");
  return { method, credentialId: credential.id };
}
