"use client";
import { ArrowLeft, Banknote, QrCode, Tag } from "lucide-react";
import type { KioskPaymentMethod, KioskVisualStyle } from "@/lib/kiosk-types";
import { KioskAction, KioskEyebrow } from "@/components/kiosk/ui";

const icon = { qris: QrCode, va: Banknote, redirect: QrCode, voucher: Tag, cash: Banknote };

export function PaymentMethodPicker({
  methods,
  disabled,
  lockLeft = 0,
  error,
  onSelect,
  onBack,
  kioskStyle,
}: {
  methods: KioskPaymentMethod[];
  disabled?: boolean;
  /** Sisa detik kunci RATE_LIMITED (docs/06 §6.3) — 0 = tidak terkunci. */
  lockLeft?: number;
  error?: string | null;
  onSelect(method: KioskPaymentMethod): void;
  onBack?(): void;
  /** Palet kiosk: permukaan kartu, aksen CTA, radius tombol. */
  kioskStyle?: KioskVisualStyle;
}) {
  const ks = kioskStyle;
  const radius = ks?.radius ?? 0;
  return (
    <section className="flex w-full flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <KioskEyebrow>{"METODE PEMBAYARAN"}</KioskEyebrow>
        <h2 className="font-display text-xl uppercase leading-none tracking-[-0.02em] md:text-2xl">
          Pilih cara bayar
        </h2>
      </div>

      {error && (
        <p
          role="alert"
          className="border-2 border-destructive bg-destructive/10 px-3 py-2 text-xs font-bold uppercase leading-relaxed tracking-[0.04em]"
          style={{ borderRadius: radius }}
        >
          {error}
        </p>
      )}
      {lockLeft > 0 && (
        <p role="status" className="font-mono text-xs font-bold uppercase tracking-[0.06em]">
          {`Tombol bayar terbuka lagi dalam ${lockLeft} detik.`}
        </p>
      )}
      {methods.length === 0 && (
        // Owner belum mengaktifkan credential gateway apa pun, atau mode
        // photobox memfilter semuanya. Grid kosong tanpa pesan = customer
        // menatap layar buntu tanpa tahu harus apa.
        <p
          role="status"
          className="border-2 border-ink bg-accent-2/20 px-4 py-3 text-sm leading-relaxed"
          style={{ borderRadius: radius }}
        >
          Belum ada metode pembayaran aktif di booth ini. Hubungi petugas.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {methods.map((method, index) => {
          const Icon = icon[method.display];
          const featured = index === 0;
          return (
            <button
              key={method.id}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(method)}
              className={`flex min-h-[132px] flex-col items-start justify-between gap-4 border-2 border-ink p-4 text-left shadow-[4px_4px_0_0_#111111] transition-transform duration-150 hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink active:translate-y-[2px] active:shadow-none disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none ${
                featured ? "bg-accent" : "bg-surface"
              }`}
              style={
                featured && ks
                  ? { borderRadius: radius, backgroundColor: ks.accent, color: ks.accentText }
                  : { borderRadius: radius }
              }
            >
              <Icon className="size-6" aria-hidden />
              <span className="flex min-w-0 flex-col gap-1">
                <strong className="block font-display text-lg font-bold uppercase leading-none tracking-[-0.02em]">
                  {method.label}
                </strong>
                {method.hint && (
                  <small className="block text-[11px] leading-snug opacity-75">{method.hint}</small>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {onBack && (
        <KioskAction
          tone="secondary"
          size="md"
          onClick={onBack}
          disabled={disabled}
          kioskStyle={ks}
          className="w-fit font-mono tracking-[0.1em]"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Kembali
        </KioskAction>
      )}
    </section>
  );
}
