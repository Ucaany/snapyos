/** Client-safe payment DTOs. Tidak boleh import modul server di file ini. */
export type InvoiceQrisResult = {
  status: "pending" | "paid" | "expired"
  qr_image: string | null
  qr_url: string | null
  amount: number
  total_amount: number
  expires_at: string | null
  invoice_number: string
  /** Redirect URL (Midtrans Snap/Tripay checkout) — null bila QRIS/VA. */
  payment_url: string | null
  /** Virtual Account number — null bila bukan VA. */
  va_number: string | null
}
