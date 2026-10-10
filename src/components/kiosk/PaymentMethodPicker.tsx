"use client"
import { Banknote, QrCode, Tag } from "lucide-react"
import type { KioskPaymentMethod } from "@/lib/kiosk-types"
const icon = { qris: QrCode, va: Banknote, redirect: QrCode, voucher: Tag, cash: Banknote }
export function PaymentMethodPicker({
  methods,
  disabled,
  error,
  onSelect,
}: {
  methods: KioskPaymentMethod[]
  disabled?: boolean
  error?: string | null
  onSelect(method: KioskPaymentMethod): void
}) {
  return (
    <section className="mx-auto flex w-full max-w-[1000px] flex-1 flex-col justify-center gap-4">
      <div className="border-2 border-ink bg-surface p-4 shadow-[4px_4px_0_0_#111111]">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-ink/70">
          [ PILIH PEMBAYARAN ]
        </p>
        <h2 className="mt-2 font-display text-3xl uppercase leading-[0.9] tracking-tight">
          Pilih metode
        </h2>
      </div>
      {error && (
        <p
          role="alert"
          className="border-2 border-destructive bg-destructive/10 px-3 py-2 font-mono text-xs text-ink"
        >
          {error}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {methods.map((method, index) => {
          const Icon = icon[method.display]
          return (
            <button
              key={method.id}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(method)}
               className={`flex min-h-32 flex-col items-start justify-between border-2 border-ink p-4 text-left shadow-[4px_4px_0_0_#111111] transition-transform active:translate-y-[2px] disabled:opacity-50 disabled:shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${index === 0 ? "bg-accent" : "bg-surface"}`}
            >
              <Icon className="size-7" />
              <span>
                <strong className="block font-display text-xl uppercase">{method.label}</strong>
                <small className="font-mono text-[10px] uppercase">{method.hint}</small>
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
