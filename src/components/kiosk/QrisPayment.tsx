/* eslint-disable @next/next/no-img-element */

"use client"
import { ArrowLeft, Loader2 } from "lucide-react"
import { formatIDR } from "@/lib/dashboard-math"
export type PendingPayment = {
  status: "pending" | "paid"
  payment_reference: string
  qr_string: string | null
  qr_image: string | null
  qr_url: string | null
  total_amount: number
  expires_at: string | null
  checkout_session_id: string
  display: "qris" | "va" | "redirect" | "cash" | "voucher"
  payment_url: string | null
  va_number: string | null
  method: string
}
export function QrisPayment({
  payment,
  qrSrc,
  left,
  online,
  onBack,
}: {
  payment: PendingPayment
  qrSrc: string | null
  left: number
  online: boolean
  onBack(): void
}) {
  const time = `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`
  return (
    <div className="mx-auto grid w-full max-w-[1000px] flex-1 grid-cols-1 gap-4 md:grid-cols-2 md:content-center">
      <section className="flex flex-col justify-center gap-3 border-2 border-ink bg-surface p-5 shadow-[4px_4px_0_0_#111111]">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em]">[ SCAN QRIS ]</p>
        {qrSrc ? (
          <img
            src={qrSrc}
            alt="Kode QR pembayaran"
            className="max-h-[42vh] w-auto max-w-full border-2 border-ink bg-surface p-3"
          />
        ) : (
          <p className="border-2 border-ink p-5 font-mono text-xs uppercase">QR tidak tersedia</p>
        )}
        <p className="font-mono text-3xl font-bold">{formatIDR(payment.total_amount)}</p>
      </section>
      <section className="flex flex-col justify-center gap-4 border-2 border-ink bg-accent p-5 shadow-[4px_4px_0_0_#111111]">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em]">[ STATUS ]</p>
        <p className="font-mono text-sm font-bold uppercase" aria-live="polite">
          <span
            className={`mr-2 inline-block size-3 border-2 border-ink ${online ? "animate-pulse bg-bg" : "bg-ink/40"}`}
          />
          {online ? "Menunggu pembayaran" : "Menunggu koneksi"}
        </p>
        {payment.expires_at && (
          <p className="font-mono text-sm font-bold uppercase">Berakhir {time}</p>
        )}
        <p>Sesi foto terbuka setelah pembayaran terverifikasi.</p>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex w-fit items-center gap-2 border-2 border-ink bg-bg px-4 py-2 font-mono text-xs font-bold uppercase shadow-[3px_3px_0_0_#111111] active:translate-y-[2px]"
        >
          <ArrowLeft className="size-4" />
          Kembali
        </button>
      </section>
    </div>
  )
}
export function PaidNotice() {
  return (
    <div className="mx-auto flex min-h-[50dvh] w-full max-w-[1000px] flex-1 flex-col items-center justify-center gap-4 border-2 border-ink bg-accent p-6 shadow-[4px_4px_0_0_#111111]">
      <Loader2 className="size-8 animate-spin" />
      <p className="font-mono text-sm font-bold uppercase">
            Pembayaran berhasil. Membuka sesi foto
      </p>
    </div>
  )
}
