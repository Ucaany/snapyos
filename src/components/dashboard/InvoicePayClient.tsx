"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Download, Loader2, QrCode } from "lucide-react";

import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent } from "@/components/ui/card";
import { formatIDR } from "@/lib/dashboard-math";
import { useQrisPolling } from "@/hooks/use-qris-polling";
import { createInvoiceQrisAction, invoicePaymentStatusAction } from "@/server/subscription-actions";
import type { InvoiceQrisResult } from "@/lib/payment-contracts";
import { ExternalLink, Landmark } from "lucide-react";

type InvoiceItem = { type: string; name: string; qty: number; amount: number };

type Props = {
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
  businessName: string;
  itemName: string;
  items: InvoiceItem[];
  canWrite: boolean;
  initialStatus: string;
};

function mmss(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Halaman pembayaran invoice — QRIS dengan batas waktu (docs/02 §2.5, docs/06).
 * QR TIDAK dibuat otomatis: user konfirmasi dulu dengan tombol "Bayar sekarang".
 * Lewat batas waktu QR aktif hangus otomatis; invoice pending tetap dapat QR baru.
 * Komposisi (plan + add-on + promo) sudah fix dari layar konfirmasi; setelah
 * paid: plan/add-on aktif otomatis.
 */
export function InvoicePayClient({
  invoiceId,
  invoiceNumber,
  amount: initialAmount,
  businessName,
  itemName,
  items: initialItems,
  canWrite,
  initialStatus,
}: Props) {
  const router = useRouter();
  const [phase, setPhase] = useState<"idle" | "preparing" | "qr" | "paid" | "expired" | "error">(
    initialStatus === "paid" ? "paid" : "idle"
  );
  const [payment, setPayment] = useState<InvoiceQrisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [amount] = useState(initialAmount);
  const [items] = useState<InvoiceItem[]>(initialItems);

  const settle = useCallback(() => {
    setPhase("paid");
    router.refresh();
  }, [router]);

  // Polling QRIS (interval + countdown + offline guard + recovery) via hook
  // bersama dengan kiosk checkout — aktif hanya selama fase qr.
  const pollStatus = useCallback(async () => {
    const res = await invoicePaymentStatusAction(invoiceId);
    if (res.status === "paid") {
      settle();
      return "paid" as const;
    }
    if (res.status === "expired") {
      setPhase("expired");
      return "expired" as const;
    }
    return "pending" as const;
  }, [invoiceId, settle]);

  const { left } = useQrisPolling({
    active: phase === "qr",
    expiresAt: payment?.expires_at ?? null,
    poll: pollStatus,
    onExpired: () => setPhase("expired"),
  });

  const createQris = useCallback(async () => {
    setError(null);
    setPhase("preparing");
    setPayment(null);
    try {
      const res = await createInvoiceQrisAction(invoiceId);
      if (res.error || !res.data) {
        setError(res.error ?? "Gagal membuat QRIS. Coba lagi.");
        setPhase("error");
        return;
      }
      if (res.data.status === "paid") {
        settle();
        return;
      }
      setPayment(res.data);
      setPhase("qr");
    } catch {
      setError("Gagal membuat QRIS. Coba lagi.");
      setPhase("error");
    }
  }, [invoiceId, settle]);

  const start = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await createQris();
    } finally {
      setBusy(false);
    }
  }, [busy, createQris]);

  // Pakasir mengirim payload QRIS mentah (EMVCo string, mis. `0002010102...`)
  // pada `qr_image`; render ke data URI PNG di client agar bisa dipakai
  // langsung sebagai `<img src>`. `qr_url` (bila ada) dipakai apa adanya.
  const rawQr = payment?.qr_image ?? payment?.qr_url ?? null;
  const directQr = rawQr && (rawQr.startsWith("data:") || rawQr.startsWith("http")) ? rawQr : null;
  const needsEncode = rawQr && !directQr ? rawQr : null;
  const [encodedQr, setEncodedQr] = useState<{ src: string; url: string } | null>(null);
  const [encodeError, setEncodeError] = useState<string | null>(null);
  useEffect(() => {
    if (!needsEncode) return;
    let cancelled = false;
    void (async () => {
      try {
        const { default: QRCode } = await import("qrcode");
        const url = await QRCode.toDataURL(needsEncode, {
          errorCorrectionLevel: "M",
          width: 400,
          margin: 2,
        });
        if (!cancelled) setEncodedQr({ src: needsEncode, url });
      } catch (err: unknown) {
        if (!cancelled) {
          setEncodeError(
            err instanceof Error ? `Gagal merender QR: ${err.message}` : "Gagal merender QR"
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [needsEncode]);
  const qrSrc = directQr ?? (encodedQr && encodedQr.src === needsEncode ? encodedQr.url : null);
  const qrEncoding = Boolean(needsEncode) && !qrSrc && !encodeError;

  if (initialStatus === "void") {
    return (
      <div className="flex flex-col items-start gap-4 rounded-none border-2 border-ink p-6 shadow-hard">
        <p className="font-display text-2xl uppercase tracking-tight">Invoice dibatalkan</p>
        <p className="max-w-[50ch] text-sm">
          Invoice {invoiceNumber} sudah tidak berlaku (plan diganti atau dibatalkan). Kembali ke
          Subscription untuk melihat tagihan aktif.
        </p>
        <Link href="/dashboard/subscription" className={buttonVariants({ variant: "outline" })}>
          <ArrowLeft className="size-4" aria-hidden /> Kembali
        </Link>
      </div>
    );
  }

  if (phase === "paid") {
    return (
      <div className="flex flex-col items-start gap-4 rounded-none border-2 border-ink p-6 shadow-hard">
        <p className="flex items-center gap-2 font-display text-2xl uppercase tracking-tight">
          <CheckCircle2 className="size-5" aria-hidden /> Pembayaran berhasil
        </p>
        <p className="max-w-[55ch] text-sm">
          Invoice {invoiceNumber} ({formatIDR(amount)}) lunas.{" "}
          {itemName
            ? `${itemName} sudah aktif otomatis untuk ${businessName}.`
            : `${businessName} sudah aktif.`}
        </p>
        <div className="flex flex-wrap gap-3">
          <a
            href={`/dashboard/subscription/invoice/${invoiceId}/receipt?download=1`}
            download={`${invoiceNumber}.pdf`}
            className={buttonVariants({ variant: "outline" })}
          >
            <Download className="size-4" aria-hidden /> Unduh bukti invoice
          </a>
          <Link href="/dashboard/subscription" className={buttonVariants({ variant: "outline" })}>
            <ArrowLeft className="size-4" aria-hidden /> Kembali ke Subscription
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      <Card className="flex-1">
        <CardContent className="flex flex-1 flex-col gap-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground">
            Tagihan
          </p>
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-display text-2xl uppercase tracking-tight">{invoiceNumber}</h2>
            <p className="shrink-0 font-mono text-2xl font-bold tabular-nums" aria-live="polite">
              {formatIDR(amount)}
            </p>
          </div>
          <dl className="flex flex-col gap-1.5 border-t-2 border-ink/10 pt-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Bisnis</dt>
              <dd className="font-mono font-bold">{businessName}</dd>
            </div>
            {items.length > 0 && (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Item</dt>
                <dd className="text-right font-mono font-bold">
                  {items.map((it) => (
                    <span key={`${it.type}-${it.name}`} className="block truncate">
                      {it.name}
                      {it.qty > 1 ? ` ×${it.qty}` : ""} · {formatIDR(it.amount * it.qty)}
                    </span>
                  ))}
                </dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Metode</dt>
              <dd className="font-mono font-bold">QRIS</dd>
            </div>
          </dl>

          <p className="mt-auto text-xs text-muted-foreground">
            Perlu ubah plan / tambah add-on? Batalkan invoice ini dan ulangi checkout dari halaman
            Subscription.
          </p>
        </CardContent>
      </Card>

      <section className="flex flex-col items-center justify-center gap-3 rounded-none border-2 border-ink p-5 shadow-hard">
        <p className="self-start text-xs text-muted-foreground">Scan QRIS</p>

        {phase === "idle" && (
          <div className="flex w-full flex-col items-start gap-3">
            <p className="font-mono text-xs uppercase tracking-[0.1em]">
              Siap bayar: konfirmasi dulu
            </p>
            <p className="font-display text-4xl uppercase tracking-tight tabular-nums">
              {formatIDR(amount)}
            </p>
            <p className="text-xs">
              QRIS hanya dibuat setelah Anda menekan tombol bayar (berbatas waktu).
            </p>
            <Button type="button" onClick={() => void start()} disabled={busy || !canWrite}>
              <QrCode className="size-4" aria-hidden /> Bayar sekarang: {formatIDR(amount)}
            </Button>
            {error && (
              <p
                role="alert"
                className="border-2 border-destructive bg-destructive/10 px-3 py-2 font-mono text-xs uppercase tracking-[0.05em] text-destructive"
              >
                {error}
              </p>
            )}
          </div>
        )}

        {phase === "preparing" && (
          <p className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-[0.05em]">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Menyiapkan QRIS...
          </p>
        )}

        {phase === "error" && (
          <div className="flex w-full flex-col items-start gap-3">
            <p
              role="alert"
              className="border-2 border-destructive bg-destructive/10 px-3 py-2 font-mono text-xs uppercase tracking-[0.05em] text-destructive"
            >
              {error}
            </p>
            <Button type="button" onClick={() => void start()} disabled={busy || !canWrite}>
              <QrCode className="size-4" aria-hidden /> Coba lagi
            </Button>
          </div>
        )}

        {phase === "expired" && (
          <div className="flex w-full flex-col items-start gap-3">
            <p className="font-mono text-xs uppercase tracking-[0.1em]">
              Waktu habis: QRIS kedaluwarsa
            </p>
            <p className="text-xs">
              QR sebelumnya tidak bisa dibayar. Invoice ini tetap pending; buat QR baru dengan
              nominal dan item yang sama.
            </p>
            <Button type="button" onClick={() => void start()} disabled={busy || !canWrite}>
              <QrCode className="size-4" aria-hidden /> Buat QR baru
            </Button>
          </div>
        )}

        {phase === "qr" && payment?.payment_url && (
          <div className="flex w-full flex-col items-start gap-3">
            <p className="font-mono text-xs uppercase tracking-[0.1em]">
              Lanjutkan pembayaran di gateway
            </p>
            <p className="font-display text-3xl uppercase tracking-tight tabular-nums">
              {formatIDR(payment.total_amount)}
            </p>
            <a
              href={payment.payment_url}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants()}
            >
              <ExternalLink className="size-4" aria-hidden /> Buka halaman pembayaran
            </a>
            <p className="text-xs text-muted-foreground" aria-live="polite">
              Pembayaran dipantau otomatis. Jendela ini akan tertutup saat status lunas.
            </p>
          </div>
        )}

        {phase === "qr" && payment?.va_number && (
          <div className="flex w-full flex-col items-start gap-3">
            <p className="font-mono text-xs uppercase tracking-[0.1em]">Nomor Virtual Account</p>
            <p className="flex items-center gap-2 font-mono text-3xl font-bold tabular-nums">
              <Landmark className="size-5" aria-hidden /> {payment.va_number}
            </p>
            <p className="text-sm" aria-live="polite">
              Transfer senilai{" "}
              <span className="font-mono font-bold tabular-nums">
                {formatIDR(payment.total_amount)}
              </span>{" "}
              ke nomor di atas. Berakhir dalam{" "}
              <span className={left <= 60 ? "text-destructive" : ""}>{mmss(left)}</span>
            </p>
          </div>
        )}

        {phase === "qr" && payment && !payment.payment_url && !payment.va_number && (
          <>
            {qrSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qrSrc}
                alt={`Kode QRIS invoice ${invoiceNumber}`}
                className="w-full max-w-[280px] rounded-none border-2 border-ink bg-surface p-2"
              />
            ) : qrEncoding ? (
              <div className="flex aspect-square w-full max-w-[280px] items-center justify-center border-2 border-dashed border-ink/40 bg-muted p-6 text-center text-xs text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden /> Merender QR...
              </div>
            ) : (
              <div
                role="alert"
                className="flex aspect-square w-full max-w-[280px] flex-col items-center justify-center gap-2 border-2 border-dashed border-destructive/60 bg-destructive/5 p-6 text-center text-xs text-ink"
              >
                <span className="font-mono font-bold uppercase tracking-[0.08em]">
                  QR tidak tersedia
                </span>
                <span className="text-muted-foreground">
                  {encodeError ?? "Provider tidak mengirim payload QRIS. Buat QR baru."}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void start()}
                  disabled={busy || !canWrite}
                >
                  <QrCode className="size-4" aria-hidden /> Coba lagi
                </Button>
              </div>
            )}
            <p className="font-mono text-2xl font-bold tabular-nums">
              {formatIDR(payment.total_amount)}
            </p>
            <p className="text-sm" aria-live="polite">
              Menunggu pembayaran · berakhir dalam{" "}
              <span className={left <= 60 ? "text-destructive" : ""}>{mmss(left)}</span>
            </p>
            <p className="max-w-[40ch] text-center text-xs text-muted-foreground">
              Scan dengan aplikasi bank / e-wallet apa pun. Total sudah termasuk kode unik. Lewat
              batas waktu, QR aktif hangus; invoice tetap dapat dibuatkan QR baru.
            </p>
          </>
        )}

        {!canWrite && phase !== "expired" && phase !== "error" && (
          <p className="font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground">
            Hanya owner yang dapat membayar invoice.
          </p>
        )}
      </section>
    </div>
  );
}
