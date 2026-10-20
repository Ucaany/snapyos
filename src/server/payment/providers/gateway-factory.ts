/**
 * Pure gateway factory. No DB/server-only dependency; used by registry and tests.
 */

import { createMidtransGateway } from "./midtrans.ts";
import { createTripayGateway } from "./tripay.ts";
import { createPakasirGateway } from "./pakasir.ts";
import type { GatewayCredential, PaymentGateway } from "./types.ts";

/** Direct credential adapter; null preserves Pakasir aggregator fallback. */
export function resolveGatewayFromCredential(credential: GatewayCredential | null): PaymentGateway {
  if (!credential) return createPakasirGateway(null);
  switch (credential.provider) {
    case "midtrans":
      return createMidtransGateway(credential);
    case "tripay":
      return createTripayGateway(credential);
    case "pakasir":
      return createPakasirGateway(credential);
    default:
      throw new Error(`Provider tidak dikenal: ${credential.provider as string}`);
  }
}
