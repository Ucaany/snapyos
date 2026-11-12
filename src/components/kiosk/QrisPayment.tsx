/* eslint-disable @next/next/no-img-element */

"use client";
import { ArrowLeft, Loader2 } from "lucide-react";
import { formatIDR } from "@/lib/dashboard-math";
import type { KioskVisualStyle } from "@/lib/kiosk-types";
import { KioskAction, KioskCard, KioskEyebrow } from "@/components/kiosk/ui";

export type PendingPayment = {
  status: "pending" | "paid" | "expired";
  payment_reference: string;
  qr_string: string | null;
  qr_image: string | null;
  qr_url: string | null;
  amount: number;
  total_amount: number;
  expires_at: string | null;
  checkout_session_id: string;
  display: "qris" | "va" | "redirect" | "cash" | "voucher";
  payment_url: string | null;
  va_number: string | null;
  method: string;
};

function mmss(left: number): string {
  return `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`;
}

export function QrisPayment({
  payment,
  qrSrc,
  left,
  online,
  onBack,
  kioskStyle,
}: {
  payment: PendingPayment;
  qrSrc: string | null;
  left: number;
  online: boolean;
  onBack(): void;
  kioskStyle?: KioskVisualStyle;
}) {
  const ks = kioskStyle;
  const radius = ks?.radius ?? 0;
  const accentStyle = ks
    ? { borderRadius: radius, backgroundColor: ks.accent, color: ks.accentText }
    : { borderRadius: radius };
  return (
    <div className="grid w-full gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-start">
      <KioskCard
        elevated
        className="flex flex-col gap-4 p-4 md:p-5"
        style={{ borderRadius: radius }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <KioskEyebrow>{"PINDAI QRIS"}</KioskEyebrow>
            <p className="font-display text-lg uppercase leading-none tracking-[-0.02em] md:text-xl">
              Scan dengan aplikasi bank
            </p>
          </div>
          <span className="shrink-0 border-2 border-ink bg-bg px-2 py-1 font-mono text-[10px] font-bold uppercase leading-none tracking-[0.08em]">
            {payment.method}
          </span>
        </div>

        <div className="flex flex-col items-center gap-3">
          {qrSrc ? (
            <img
              src={qrSrc}
              alt="Kode QR pembayaran"
              className="h-auto w-full max-w-[300px] border-2 border-ink bg-surface p-3"
            />
          ) : (
            <p className="border-2 border-dashed border-ink/40 p-6 text-center font-mono text-xs uppercase tracking-[0.08em]">
              QR tidak tersedia
            </p>
          )}
          <p className="font-mono text-2xl font-bold leading-none tracking-[-0.02em] md:text-3xl">
            {formatIDR(payment.total_amount)}
          </p>
          {payment.total_amount > payment.amount && (
            <p className="max-w-[44ch] text-center text-xs leading-relaxed text-muted-foreground">
              Termasuk kode unik {formatIDR(payment.total_amount - payment.amount)}. Transfer tepat
              sesuai nominal.
            </p>
          )}
        </div>
      </KioskCard>

      <KioskCard className="flex flex-col justify-center gap-4 p-4 md:p-5" style={accentStyle}>
        <KioskEyebrow className="opacity-70">{"STATUS PEMBAYARAN"}</KioskEyebrow>
        <p className="flex items-center gap-2 font-display text-base uppercase leading-none tracking-[-0.01em] md:text-lg">
          <span
            className={`inline-block size-2.5 shrink-0 rounded-full border-2 ${
              online ? "motion-safe:animate-pulse border-current bg-current" : "border-current"
            }`}
            aria-hidden
          />
          <span aria-live="polite">{online ? "Menunggu pembayaran" : "Menunggu koneksi"}</span>
        </p>
        {payment.expires_at && (
          <p className="font-mono text-xs font-bold uppercase tracking-[0.08em]">
            Berakhir {mmss(left)}
          </p>
        )}
        <p className="max-w-[40ch] text-sm leading-relaxed opacity-85">
          Sesi foto terbuka otomatis begitu pembayaran terverifikasi. Jangan tutup layar.
        </p>
        <KioskAction
          tone="secondary"
          size="md"
          onClick={onBack}
          className="w-fit border-current bg-transparent font-mono tracking-[0.1em]"
          style={{ borderRadius: radius }}
        >
          <ArrowLeft className="size-4" aria-hidden />
          Kembali
        </KioskAction>
      </KioskCard>
    </div>
  );
}

export function PaidNotice({
  onRetry,
  busy,
  kioskStyle,
}: { onRetry?(): void; busy?: boolean; kioskStyle?: KioskVisualStyle } = {}) {
  const radius = kioskStyle?.radius ?? 0;
  return (
    <div
      className="flex flex-col items-center justify-center gap-4 border-2 border-ink bg-accent p-6 text-center shadow-hard"
      style={
        kioskStyle
          ? {
              borderRadius: radius,
              backgroundColor: kioskStyle.accent,
              color: kioskStyle.accentText,
            }
          : { borderRadius: radius }
      }
    >
      <Loader2 className="size-7 motion-safe:animate-spin" aria-hidden />
      <p className="font-display text-lg uppercase leading-none tracking-[-0.01em] md:text-xl">
        {busy ? "Pembayaran berhasil. Membuka sesi foto" : "Pembayaran berhasil."}
      </p>
      {/* Uang customer sudah masuk di titik ini. Layar yang hanya berputar
          selamanya berarti mereka membayar tanpa mendapat sesi foto: jadi
          kegagalan membuka sesi harus punya tombol ulang, bukan jalan buntu. */}
      {!busy && onRetry && (
        <>
          <p className="max-w-[44ch] text-sm leading-relaxed opacity-85">
            Sesi foto belum terbuka. Tekan tombol di bawah untuk mencoba lagi.
          </p>
          <KioskAction
            tone="secondary"
            size="md"
            onClick={onRetry}
            className="border-current bg-transparent"
            style={{ borderRadius: radius }}
          >
            Buka sesi foto
          </KioskAction>
        </>
      )}
    </div>
  );
}
