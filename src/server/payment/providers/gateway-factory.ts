/**
 * Pure gateway factory. No DB/server-only dependency; used by registry and tests.
 * `null` credential = gateway PLATFORM (invoice subscription), bukan tenant.
 */

import { createMidtransGateway } from "./midtrans.ts";
import { createTripayGateway } from "./tripay.ts";
import { gatewayEnvironment } from "../../../lib/payment-credentials.ts";
import type { GatewayCredential, PaymentGateway } from "./types.ts";

const PLATFORM_TRIPAY_ID = "platform-tripay";

function requirePlatformEnv(name: string): string {
  const value = process.env[name]?.trim() ?? "";
  if (!value) {
    throw new Error(`Payment platform Tripay belum terkonfigurasi: ${name} kosong.`);
  }
  return value;
}

/**
 * Credential Tripay milik SnapyOS untuk invoice subscription. Dana langganan
 * WAJIB masuk akun platform — jangan pernah memakai credential tenant.
 */
function platformTripayCredential(): GatewayCredential {
  return {
    id: PLATFORM_TRIPAY_ID,
    provider: "tripay",
    merchantId: requirePlatformEnv("TRIPAY_MERCHANT_CODE"),
    serverKey: requirePlatformEnv("TRIPAY_API_KEY"),
    clientKey: null,
    environment: gatewayEnvironment(),
    metadata: { private_key: requirePlatformEnv("TRIPAY_PRIVATE_KEY") },
  };
}

/** Direct credential adapter; null = gateway platform (Tripay). */
export function resolveGatewayFromCredential(credential: GatewayCredential | null): PaymentGateway {
  if (!credential) return createTripayGateway(platformTripayCredential());
  switch (credential.provider) {
    case "midtrans":
      return createMidtransGateway(credential);
    case "tripay":
      return createTripayGateway(credential);
    default:
      throw new Error(`Provider tidak dikenal: ${credential.provider as string}`);
  }
}
