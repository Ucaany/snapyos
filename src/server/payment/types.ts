import type { QrisCreateResult } from "@/lib/qris-helpers"

export interface QrisCreateResponse extends QrisCreateResult {
  /** Referensi internal (12 hex) — order_id = SnapyOS-<payment_reference>. */
  payment_reference: string
}

/** Legacy interface — masih dipakai oleh qris.ts, invoice.ts. Jangan hapus. */
export interface PaymentProvider {
  createQris(input: {
    amount: number
    keterangan: string
    callbackUrl?: string | null
    paymentReference?: string
  }): Promise<QrisCreateResponse>
  getStatus(orderId: string, amount?: number, providerRef?: string | null): Promise<"pending" | "paid" | "expired">
}

// Re-export PaymentGateway types (Phase 1 multi-provider abstraction).
export type {
  PaymentGateway,
  GatewayCreateResult,
  GatewayStatus,
  GatewayCredential,
  GatewayProvider,
} from "./providers/types"
