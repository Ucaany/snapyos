"use client"
import { Banknote } from "lucide-react"
import { formatIDR } from "@/lib/dashboard-math"
export function CashPayment({ amount }: { amount: number }) {
  return (
    <div
      className="mx-auto flex w-full max-w-[700px] flex-1 flex-col justify-center gap-4 border-2 border-ink bg-accent-2 p-6 shadow-[4px_4px_0_0_#111111]"
      aria-live="polite"
    >
      <Banknote className="size-9" />
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em]">[ BAYAR DI KASIR ]</p>
      <h2 className="font-display text-4xl uppercase leading-[0.9]">Hubungi petugas</h2>
      <p>
        Bayarkan <strong>{formatIDR(amount)}</strong> kepada petugas. Sesi foto dibuka setelah
        petugas mengonfirmasi pembayaran.
      </p>
      <p className="font-mono text-xs font-bold uppercase">
        Menunggu konfirmasi operator. Jangan tutup layar.
      </p>
    </div>
  )
}
