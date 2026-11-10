"use client";
import { ArrowLeft, Banknote } from "lucide-react";
import { formatIDR } from "@/lib/dashboard-math";
import type { KioskVisualStyle } from "@/lib/kiosk-types";
import { KioskAction, KioskCard, KioskEyebrow } from "@/components/kiosk/ui";

export function CashPayment({
  amount,
  left,
  onCancel,
  kioskStyle,
}: {
  amount: number;
  left: number;
  onCancel(): void;
  kioskStyle?: KioskVisualStyle;
}) {
  const ks = kioskStyle;
  const radius = ks?.radius ?? 0;
  const time = `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`;
  return (
    <KioskCard
      elevated
      className="mx-auto flex w-full max-w-[720px] flex-col gap-4 p-5 md:p-6"
      style={{ borderRadius: radius }}
      aria-live="polite"
    >
      <div className="flex items-center gap-3">
        <Banknote className="size-7 shrink-0" aria-hidden />
        <KioskEyebrow>{"BAYAR DI KASIR"}</KioskEyebrow>
      </div>
      <h2 className="font-display text-2xl uppercase leading-[0.95] tracking-[-0.02em] md:text-3xl">
        Hubungi petugas
      </h2>
      <p className="max-w-[52ch] text-sm leading-relaxed text-muted-foreground md:text-base">
        Bayarkan <strong className="text-ink">{formatIDR(amount)}</strong> kepada petugas. Sesi foto
        dibuka setelah petugas mengonfirmasi pembayaran.
      </p>
      <p className="font-mono text-xs font-bold uppercase leading-relaxed tracking-[0.08em]">
        Menunggu konfirmasi operator. Jangan tutup layar.
      </p>
      {left > 0 && (
        <p className="font-mono text-xs font-bold uppercase tracking-[0.08em]">Berakhir {time}</p>
      )}
      <KioskAction
        tone="secondary"
        size="md"
        onClick={onCancel}
        kioskStyle={ks}
        className="w-fit font-mono tracking-[0.1em]"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Batalkan
      </KioskAction>
    </KioskCard>
  );
}
