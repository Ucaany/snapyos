"use client";
import { ArrowLeft, Tag } from "lucide-react";
import type { KioskVisualStyle } from "@/lib/kiosk-types";
import { OnScreenKeyboard } from "./OnScreenKeyboard";
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
  return (
    <div
      className="mx-auto flex w-full max-w-[700px] flex-1 flex-col justify-center gap-4 border-2 border-ink bg-surface p-6 shadow-[4px_4px_0_0_#111111]"
      style={ks ? { borderRadius: ks.radius } : undefined}
    >
      <Tag className="size-8" />
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em]">[ VOUCHER SESI ]</p>
      <h2 className="font-display text-3xl uppercase leading-[0.9]">Masukkan kode voucher</h2>
      <label className="font-mono text-xs font-bold uppercase">
        Kode voucher
        <input
          value={code}
          onChange={(event) => onCode(event.target.value.toUpperCase())}
          className="mt-2 w-full border-2 border-ink bg-bg px-3 py-3 font-mono text-lg uppercase focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          autoComplete="off"
        />
      </label>
      <OnScreenKeyboard
        disabled={busy}
        onKey={(k) => onCode(code + k)}
        onBackspace={() => onCode(code.slice(0, -1))}
      />
      {error && (
        <p role="alert" className="font-mono text-xs font-bold uppercase">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onApply}
          disabled={busy || !code.trim()}
          className="w-fit border-2 border-ink bg-accent px-5 py-3 font-display text-lg uppercase shadow-[4px_4px_0_0_#111111] active:translate-y-[2px] disabled:opacity-50"
          style={
            ks
              ? { borderRadius: ks.radius, backgroundColor: ks.accent, color: ks.accentText }
              : undefined
          }
        >
          {busy ? "Memeriksa" : "Gunakan voucher"}
        </button>
        <button
          type="button"
          onClick={onBack}
          disabled={busy}
          className="inline-flex min-h-11 w-fit items-center gap-2 border-2 border-ink bg-bg px-4 py-3 font-mono text-xs font-bold uppercase shadow-[3px_3px_0_0_#111111] active:translate-y-[2px] disabled:opacity-50"
        >
          <ArrowLeft className="size-4" />
          Kembali
        </button>
      </div>
    </div>
  );
}
