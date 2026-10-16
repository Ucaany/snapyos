/**
 * Payment gateway types.
 * Interface legacy `PaymentProvider` (createQris + signature create) sudah
 * dihapus: provider aktif memakai abstraksi `PaymentGateway` di
 * `providers/types.ts` (satu adapter per provider, lihat gateway-factory.ts).
 */

// Re-export PaymentGateway types (Phase 1 multi-provider abstraction).
export type {
  PaymentGateway,
  GatewayCreateResult,
  GatewayStatus,
  GatewayCredential,
  GatewayProvider,
} from "./providers/types"
