/* eslint-disable @next/next/no-img-element */

"use client"
import { ArrowLeft, Loader2 } from "lucide-react"
import { formatIDR } from "@/lib/dashboard-math"
export type PendingPayment = {
  status: "pending" | "paid" | "expired"
  payment_reference: string
  qr_string: string | null
  qr_image: string | null
  qr_url: string | null
  amount: number
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
    <div className="mx-auto grid w-full max-w-[1000px] flex-1 grid-cols-1 content-center gap-3 pb-14 md:grid-cols-2 md:content-center md:gap-4 md:pb-0">
      <section className="flex flex-col justify-center gap-3 border-2 border-ink bg-surface p-4 shadow-[4px_4px_0_0_#111111] md:p-5">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em]">[ SCAN QRIS ]</p>
        {qrSrc ? (
          <img
            src={qrSrc}
            alt="Kode QR pembayaran"
            className="mx-auto max-h-[30vh] w-auto max-w-full border-2 border-ink bg-surface p-3 md:max-h-[42vh]"
          />
        ) : (
          <p className="border-2 border-ink p-5 font-mono text-xs uppercase">QR tidak tersedia</p>
        )}
        <p className="font-mono text-3xl font-bold">{formatIDR(payment.total_amount)}</p>
        {payment.total_amount > payment.amount && (
          <p className="font-mono text-[10px] uppercase tracking-[0.05em]">
            Termasuk kode unik {formatIDR(payment.total_amount - payment.amount)}. Transfer tepat
            sesuai nominal.
          </p>
        )}
      </section>
      <section className="flex flex-col justify-center gap-3 border-2 border-ink bg-accent p-4 shadow-[4px_4px_0_0_#111111] md:gap-4 md:p-5">
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
          className="inline-flex min-h-11 w-fit items-center gap-2 border-2 border-ink bg-bg px-4 py-2 font-mono text-xs font-bold uppercase shadow-[3px_3px_0_0_#111111] active:translate-y-[2px]"
        >
          <ArrowLeft className="size-4" />
          Kembali
        </button>
      </section>
    </div>
  )
}
export function PaidNotice({ onRetry, busy }: { onRetry?(): void; busy?: boolean } = {}) {
  return (
    <div className="mx-auto flex min-h-[50dvh] w-full max-w-[1000px] flex-1 flex-col items-center justify-center gap-4 border-2 border-ink bg-accent p-6 text-center shadow-[4px_4px_0_0_#111111]">
      <Loader2 className="size-8 animate-spin" />
      <p className="font-mono text-sm font-bold uppercase">
        {busy ? "Pembayaran berhasil. Membuka sesi foto" : "Pembayaran berhasil."}
      </p>
      {/* Uang customer sudah masuk di titik ini. Layar yang hanya berputar
          selamanya berarti mereka membayar tanpa mendapat sesi foto — jadi
          kegagalan membuka sesi harus punya tombol ulang, bukan jalan buntu. */}
      {!busy && onRetry && (
        <>
          <p className="max-w-[44ch] font-mono text-xs uppercase tracking-[0.1em]">
            Sesi foto belum terbuka. Tekan tombol di bawah untuk mencoba lagi.
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex min-h-11 items-center justify-center border-2 border-ink bg-bg px-5 py-3 font-mono text-xs font-bold uppercase shadow-[3px_3px_0_0_#111111] active:translate-y-[2px]"
          >
            Buka sesi foto
          </button>
        </>
      )}
    </div>
  )
}
