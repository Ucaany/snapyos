/**
 * Pure QRIS helpers (shared provider utilities) — docs/06 §6.3/§6.7.
 * Provider aktif: Pakasir (pakasir.com/p/docs) — lihat src/server/payment/pakasir.ts.
 * Berisi helpers umum (parseProviderAmount, buildOrderId, dll.).
 * Tanpa import server agar bisa di-unit-test.
 * Provider mengirim nominal sebagai string desimal ("1016.00") → integer IDR.
 */

/** "1016.00" / 1016 / "1.016" (rawak) → 1016 integer IDR; invalid → null. */
export function parseProviderAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value >= 0 ? Math.round(value) : null
  }
  if (typeof value !== "string") return null
  // Provider bisa mengirim ribuan dengan separator titik ("1.234.567") ATAU
  // desimal ("1016.00"). Aman: buang spasi, lalu bila ada LEBIH dari satu
  // titik → semua titik adalah separator ribuan (hapus semua); satu titik
  // (atau nol) → titik desimal dipertahankan. Mencegah "1.234.567" rusak
  // menjadi "1234.567" lalu dibulatkan salah ke 1235.
  const raw = value.trim().replace(/\s/g, "")
  const dotCount = (raw.match(/\./g) ?? []).length
  const normalized = dotCount > 1 ? raw.replace(/\./g, "") : raw
  const parsed = Number.parseFloat(normalized)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return Math.round(parsed)
}

/** Order ID unik SnapyOS → dikirim ke provider: SnapyOS-XXXXXXXXXXXX. */
export function buildOrderId(rand: string): string {
  return `SnapyOS-${rand.toUpperCase()}`
}

/** Pakasir datetime → ISO. Offset eksplisit dipertahankan; format tanpa offset = WIB. */
export function parseProviderDateTime(value: unknown): string | null {
  if (typeof value !== "string") return null
  const raw = value.trim()
  const withZone = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i
  const withoutZone = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d+)?$/
  const local = raw.match(withoutZone)
  const normalized = withZone.test(raw)
    ? raw
    : local
      ? `${local[1]}T${local[2]}${local[3] ?? ""}+07:00`
      : ""
  const t = Date.parse(normalized)
  return Number.isFinite(t) ? new Date(t).toISOString() : null
}

/** Hasil ternormalisasi POST /qris/create. */
export type QrisCreateResult = {
  order_id: string
  amount: number
  amount_uniq: number
  total_amount: number
  status: string
  qris_url: string | null
  qris_image: string | null
  expired_at: string | null
  signature: string
  /** Pakasir v2 transaction id — dipakai getStatus (bukan order_id). */
  provider_ref?: string | null
}

type RawCreateData = {
  order_id?: unknown
  amount?: unknown
  amount_uniq?: unknown
  total_amount?: unknown
  status?: unknown
  qris_url?: unknown
  qris_image?: unknown
  expired_at?: unknown
  signature?: unknown
}

/**
 * Normalisasi response data POST /qris/create.
 * Null bila field wajib (order_id/signature/total_amount) tidak valid.
 */
export function normalizeCreateResult(data: RawCreateData): QrisCreateResult | null {
  const orderId = typeof data.order_id === "string" ? data.order_id.trim() : ""
  const signature = typeof data.signature === "string" ? data.signature.trim() : ""
  if (!orderId || !signature) return null
  const amount = parseProviderAmount(data.amount)
  const amountUniq = parseProviderAmount(data.amount_uniq) ?? 0
  const totalAmount = parseProviderAmount(data.total_amount)
  if (amount === null || totalAmount === null) return null
  return {
    order_id: orderId,
    amount,
    amount_uniq: amountUniq,
    total_amount: totalAmount,
    status: typeof data.status === "string" ? data.status.toUpperCase() : "PENDING",
    qris_url: typeof data.qris_url === "string" && data.qris_url ? data.qris_url : null,
    qris_image:
      typeof data.qris_image === "string" && data.qris_image.startsWith("data:image")
        ? data.qris_image
        : null,
    expired_at: typeof data.expired_at === "string" && data.expired_at ? data.expired_at : null,
    signature,
  }
}
