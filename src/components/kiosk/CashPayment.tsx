"use client"
import { ArrowLeft, Banknote } from "lucide-react"
import { formatIDR } from "@/lib/dashboard-math"
import type { KioskVisualStyle } from "@/lib/kiosk-types"
export function CashPayment({
  amount,
  left,
  onCancel,
  kioskStyle,
}: {
  amount: number
  left: number
  onCancel(): void
  kioskStyle?: KioskVisualStyle
}) {
  const ks = kioskStyle
  const time = `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`
  return (
    <div
      className="mx-auto flex w-full max-w-[700px] flex-1 flex-col justify-center gap-4 border-2 border-ink bg-surface p-6 shadow-[4px_4px_0_0_#111111]"
      style={ks ? { borderRadius: ks.radius } : undefined}
      aria-live="polite"
    >
      <Banknote className="size-9" />
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em]">[ BAYAR DI KASIR ]</p>
      <h2 className="font-display text-4xl uppercase leading-[0.9]">Hubungi petugas</h2>
      <p>
        Bayarkan <strong>{formatIDR(amount)}</strong> kepada petugas. Sesi foto dibuka setelah
        petugas mengonfirmasi pembayaran.
      </p>
      <p className="font-mono text-sm font-bold uppercase" aria-live="polite">
        Menunggu konfirmasi operator. Jangan tutup layar.
      </p>
      {left > 0 && (
        <p className="font-mono text-sm font-bold uppercase">Berakhir {time}</p>
      )}
      <button
        type="button"
        onClick={onCancel}
        className="inline-flex min-h-11 w-fit items-center gap-2 border-2 border-ink bg-bg px-4 py-2 font-mono text-xs font-bold uppercase shadow-[3px_3px_0_0_#111111] active:translate-y-[2px]"
      >
        <ArrowLeft className="size-4" />
        Batalkan
      </button>
    </div>
  )
}
