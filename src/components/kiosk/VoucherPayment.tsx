"use client";
import { ArrowLeft, Tag } from "lucide-react";
import type { KioskVisualStyle } from "@/lib/kiosk-types";
import { OnScreenKeyboard } from "./OnScreenKeyboard";
import { KioskAction, KioskCard, KioskEyebrow, KioskHeading, KIOSK_FIELD } from "@/components/kiosk/ui";

export function VoucherPayment({
  code,
  onCode,
  onApply,
  onBack,
  busy,
  error,
  kioskStyle,
}: {
  code: string;
  onCode(value: string): void;
  onApply(): void;
  onBack(): void;
  busy: boolean;
  error: string | null;
  kioskStyle?: KioskVisualStyle;
}) {
  const ks = kioskStyle;
  const radius = ks?.radius ?? 0;
  return (
    <KioskCard
      elevated
      className="mx-auto flex w-full max-w-[720px] flex-col gap-4 p-5 md:p-6"
      style={{ borderRadius: radius }}
    >
      <div className="flex items-center gap-3">
        <Tag className="size-6 shrink-0" aria-hidden />
        <KioskEyebrow>{"VOUCHER SESI"}</KioskEyebrow>
      </div>
      <KioskHeading as="h2" size="sm" scale={ks?.fontScale ?? 1}>
        Masukkan kode voucher
        </KioskHeading>
      <label className="flex flex-col gap-2">
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em]">
          Kode voucher
        </span>
        <input
          value={code}
          onChange={(event) => onCode(event.target.value.toUpperCase())}
          className={`${KIOSK_FIELD} bg-bg py-3 text-center font-mono text-lg font-bold uppercase tracking-[0.16em]`}
          style={{ borderRadius: radius }}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={Boolean(error)}
        />
      </label>
      <OnScreenKeyboard
        disabled={busy}
        onKey={(k) => onCode(code + k)}
        onBackspace={() => onCode(code.slice(0, -1))}
      />
      {error && (
        <p
          role="alert"
          className="border-2 border-destructive bg-surface px-3 py-2 text-xs font-bold uppercase leading-relaxed tracking-[0.04em]"
        >
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <KioskAction
          tone="primary"
          size="lg"
          onClick={onApply}
          disabled={busy || !code.trim()}
          kioskStyle={ks}
        >
          {busy ? "Memeriksa" : "Gunakan voucher"}
        </KioskAction>
        <KioskAction
          tone="secondary"
          size="md"
          onClick={onBack}
          disabled={busy}
          kioskStyle={ks}
          className="font-mono tracking-[0.1em]"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Kembali
        </KioskAction>
      </div>
    </KioskCard>
  );
}
