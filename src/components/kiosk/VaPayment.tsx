"use client";
import { ArrowLeft, Copy } from "lucide-react";
import { formatIDR } from "@/lib/dashboard-math";
import type { KioskVisualStyle } from "@/lib/kiosk-types";
import type { PendingPayment } from "./QrisPayment";
export function VaPayment({
  payment,
  left,
  onBack,
  kioskStyle,
}: {
  payment: PendingPayment;
  left: number;
  onBack(): void;
  kioskStyle?: KioskVisualStyle;
}) {
  const ks = kioskStyle;
  const copy = () => {
    if (payment.va_number) void navigator.clipboard.writeText(payment.va_number);
  };
  return (
    <div
      className="mx-auto flex w-full max-w-[700px] flex-1 flex-col justify-center gap-4 border-2 border-ink bg-surface p-6 shadow-[4px_4px_0_0_#111111]"
      style={ks ? { borderRadius: ks.radius } : undefined}
    >
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em]">
        [ VIRTUAL ACCOUNT ]
      </p>
      <h2 className="font-display text-3xl uppercase leading-[0.9]">{payment.method}</h2>
      <p className="break-all border-2 border-ink bg-accent p-4 font-mono text-2xl font-bold">
        {payment.va_number ?? "Nomor VA tidak tersedia"}
      </p>
      <button
        type="button"
        onClick={copy}
        disabled={!payment.va_number}
        className="inline-flex w-fit items-center gap-2 border-2 border-ink bg-bg px-4 py-2 font-mono text-xs font-bold uppercase shadow-[3px_3px_0_0_#111111] active:translate-y-[2px]"
      >
        <Copy className="size-4" />
        Salin nomor
      </button>
      <p className="font-mono text-xl font-bold">{formatIDR(payment.total_amount)}</p>
      <p className="font-mono text-xs font-bold uppercase">
        Selesaikan transfer dalam {String(Math.floor(left / 60)).padStart(2, "0")}:
        {String(left % 60).padStart(2, "0")}
      </p>
      <button
        type="button"
        onClick={onBack}
        className="inline-flex min-h-11 w-fit items-center gap-2 border-2 border-ink bg-bg px-4 py-2 font-mono text-xs font-bold uppercase shadow-[3px_3px_0_0_#111111] active:translate-y-[2px]"
      >
        <ArrowLeft className="size-4" />
        Kembali
      </button>
    </div>
  );
}
