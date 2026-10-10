/**
 * Payment Gateway abstraction — Phase 1 (electron-kiosk-plan §Phase 1).
 * Multi-provider interface: Midtrans Core API, Tripay Closed, Pakasir.
 * NO "server-only" — used by adapters + unit tests.
 */

export type GatewayProvider = "midtrans" | "tripay" | "pakasir"

export type GatewayStatus = "pending" | "paid" | "expired" | "failed" | "cancelled"

export type GatewayCreateResult = {
  orderId: string
  amount: number
  /** Total termasuk unique code / admin fee. */
  totalAmount: number
  /** Raw QRIS string (untuk render QR di kiosk). */
  qrString: string | null
  /** QR image URL atau base64. */
  qrImageUrl: string | null
  /** Redirect URL (Midtrans Snap / Tripay checkout). */
  paymentUrl: string | null
  /** Virtual Account number. */
  vaNumber: string | null
  /** ISO datetime expiry. */
  expiresAt: string | null
  /** Reference ID dari gateway. */
  providerRef: string
}

export interface PaymentGateway {
  provider: GatewayProvider

  /** Buat transaksi QRIS/VA/e-wallet. Amount = integer IDR, server-computed. */
  createTransaction(input: {
    orderId: string
    amount: number
    description: string
    customerName?: string
    customerEmail?: string
    /** Provider webhook callback URL. */
    callbackUrl: string
    /** Customer return/deeplink URL; never used as settlement truth. */
    returnUrl?: string
    /** Requested gateway method. */
    paymentMethods?: string[]
  }): Promise<GatewayCreateResult>

  /**
   * Cek status transaksi di gateway.
   * @param orderId — ID internal; untuk Pakasir v2 ini harus txn_id (lihat providerRef).
   * @param amount — optional, dibutuhkan Pakasir (API quirk: amount wajib di query).
   * @param providerRef — Pakasir v2: txn_id dari create (dipakai endpoint transaction-status).
   */
  getStatus(orderId: string, amount?: number, providerRef?: string | null): Promise<GatewayStatus>

  /** Verifikasi webhook signature. */
  verifyWebhook(payload: unknown, signature: string): boolean

  /** Cancel/expire transaksi pending (opsional — tidak semua gateway support). */
  cancelTransaction?(orderId: string): Promise<boolean>
}

/**
 * Credential ter-decrypt (in-memory only).
 * serverKey = PLAINTEXT — JANGAN pernah dikembalikan ke response API / client.
 */
export type GatewayCredential = {
  id: string
  provider: GatewayProvider
  merchantId: string
  /** PLAINTEXT server key — hanya in-memory, NEVER log, NEVER return to client. */
  serverKey: string
  clientKey: string | null
  environment: "sandbox" | "production"
  metadata: Record<string, unknown>
}
