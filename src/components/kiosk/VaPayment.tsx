"use client";
import { ArrowLeft, Copy } from "lucide-react";
import { formatIDR } from "@/lib/dashboard-math";
import type { KioskVisualStyle } from "@/lib/kiosk-types";
import type { PendingPayment } from "./QrisPayment";
import { KioskAction, KioskCard, KioskEyebrow } from "@/components/kiosk/ui";

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
  const radius = ks?.radius ?? 0;
  const copy = () => {
    if (payment.va_number) void navigator.clipboard.writeText(payment.va_number);
  };
  return (
    <KioskCard
      elevated
      className="mx-auto flex w-full max-w-[720px] flex-col gap-4 p-5 md:p-6"
      style={{ borderRadius: radius }}
    >
      <KioskEyebrow>{"VIRTUAL ACCOUNT"}</KioskEyebrow>
      <h2 className="font-display text-2xl uppercase leading-[0.95] tracking-[-0.02em] md:text-3xl">
        {payment.method}
      </h2>
      <p
        className="break-all border-2 border-ink bg-accent px-4 py-4 font-mono text-xl font-bold leading-tight tracking-[0.02em] md:text-2xl"
        style={{ borderRadius: radius }}
      >
        {payment.va_number ?? "Nomor VA tidak tersedia"}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <KioskAction
          tone="secondary"
          size="md"
          onClick={copy}
          disabled={!payment.va_number}
          kioskStyle={ks}
        >
          <Copy className="size-4" aria-hidden />
          Salin nomor
        </KioskAction>
        <p className="font-mono text-lg font-bold leading-none">
          {formatIDR(payment.total_amount)}
        </p>
      </div>
      <p className="font-mono text-xs font-bold uppercase tracking-[0.08em]">
        {`Selesaikan transfer dalam ${String(Math.floor(left / 60)).padStart(2, "0")}:${String(
          left % 60
        ).padStart(2, "0")}`}
      </p>
      <KioskAction
        tone="secondary"
        size="md"
        onClick={onBack}
        kioskStyle={ks}
        className="w-fit font-mono tracking-[0.1em]"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Kembali
      </KioskAction>
    </KioskCard>
  );
}
