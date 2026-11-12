"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { ArrowLeft, WifiOff } from "lucide-react";
import {
  kioskThemeVars,
  type KioskPaymentMethod,
  type KioskVisualStyle,
  type PublicPackage,
} from "@/lib/kiosk-types";
import type { KioskElementsConfig } from "@/lib/kiosk-elements";
import { kioskElementText } from "@/lib/kiosk-elements";
import { formatIDR } from "@/lib/dashboard-math";
import { apiGetWithDeviceToken, apiPost, KioskError } from "@/components/kiosk/api";
import { useQrisPolling } from "@/hooks/use-qris-polling";
import { CashPayment } from "./CashPayment";
import { PaymentMethodPicker } from "./PaymentMethodPicker";
import { PaidNotice, QrisPayment, type PendingPayment } from "./QrisPayment";
import { VaPayment } from "./VaPayment";
import { VoucherPayment } from "./VoucherPayment";
import { KioskVideoBackground } from "./KioskVideoBackground";
import {
  KioskAction,
  KioskCard,
  KioskEyebrow,
  KioskHeader,
  KioskHeading,
  KioskLoading,
  kioskGutter,
} from "@/components/kiosk/ui";
import { KioskElement } from "@/components/kiosk/KioskElement";

type Amounts = {
  checkout_session_id: string;
  gross_amount: number;
  discount_amount: number;
  final_amount: number;
  payment_methods: KioskPaymentMethod[];
};
type StatusData = { status: "pending" | "paid" | "expired"; checkout_session_id: string };
type Phase =
  | "loading"
  | "summary"
  | "method-picker"
  | "qris"
  | "va"
  | "redirect"
  | "voucher"
  | "cash-waiting"
  | "paid"
  | "expired"
  | "error";
type Props = {
  businessSlug: string;
  pkg: PublicPackage;
  deviceToken: string;
  paymentTitle?: string;
  paymentHint?: string;
  /** Gaya visual kustom (Branding & Kiosk) — warna/font/radius mengikuti. */
  kioskStyle?: KioskVisualStyle;
  /** Video promo layar payment (pages.payment.video_url). */
  videoUrl?: string | null;
  offlineEnabled?: boolean;
  onOffline?(): void;
  /** Membuka sesi dari checkout paid. false = gagal; layar menawarkan ulang. */
  onPaid(checkoutId: string): Promise<boolean>;
  onBack(): void;
  /** Kustomisasi elemen layar (Branding & Kiosk). */
  elements?: KioskElementsConfig;
};

export function CheckoutScreen({
  businessSlug,
  pkg,
  deviceToken,
  paymentTitle,
  paymentHint,
  kioskStyle,
  videoUrl = null,
  offlineEnabled = false,
  onOffline,
  onPaid,
  onBack,
  elements,
}: Props) {
  const [amounts, setAmounts] = useState<Amounts | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [payment, setPayment] = useState<PendingPayment | null>(null);
  const [qrSrc, setQrSrc] = useState<string | null>(null);
  const [voucherCode, setVoucherCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Checkout id dari payment yang sudah paid — tombol coba lagi di layar "paid"
  // memanggil ulang onPaid dengan id yang sama (idempoten, lihat KioskApp).
  const [paidCheckoutId, setPaidCheckoutId] = useState<string | null>(null);
  const [paidFailed, setPaidFailed] = useState(false);
  // Kunci tombol bayar selama `details.retry_after` (docs/06 §6.3) — tanpa ini
  // customer yang menekan berulang saat 429 hanya menambah beban dan berisiko
  // double pay begitu limit lewat.
  const [lockLeft, setLockLeft] = useState(0);
  // Guard ref, bukan state: dua tap cepat dalam satu render masih membaca
  // `busy` lama (state baru terlihat setelah re-render), jadi state saja tidak
  // menahan POST /payments/create kedua.
  const creatingRef = useRef(false);
  // Hitung mundur kunci rate-limit; 0 = tombol bayar aktif.
  useEffect(() => {
    if (lockLeft <= 0) return;
    const t = setInterval(() => setLockLeft((v) => (v <= 1 ? 0 : v - 1)), 1000);
    return () => clearInterval(t);
  }, [lockLeft]);
  const load = useCallback(async () => {
    setPhase("loading");
    setError(null);
    try {
      const data = await apiPost<Amounts>(`/api/v1/public/${businessSlug}/checkout`, {
        package_id: pkg.id,
        device_token: deviceToken,
      });
      setAmounts(data);
      setPhase("summary");
    } catch (cause) {
      setError(cause instanceof KioskError ? cause.message : "Gagal memuat checkout.");
      setPhase("error");
    }
  }, [businessSlug, deviceToken, pkg.id]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    const source = payment?.qr_string ?? payment?.qr_image ?? payment?.qr_url ?? null;
    const timer = setTimeout(() => {
      if (!source) {
        setQrSrc(null);
        return;
      }
      if (source.startsWith("data:") || source.startsWith("http")) {
        setQrSrc(source);
        return;
      }
      void QRCode.toDataURL(source, { errorCorrectionLevel: "M", width: 400, margin: 2 })
        .then(setQrSrc)
        .catch(() => setQrSrc(null));
    }, 0);
    return () => clearTimeout(timer);
  }, [payment]);
  /** Buka sesi dari checkout yang sudah paid. Gagal = tawarkan ulang, bukan
   *  layar berputar selamanya (uang customer sudah masuk di titik ini). */
  const openPaidSession = useCallback(
    async (checkoutId: string) => {
      setPaidFailed(false);
      const ok = await onPaid(checkoutId);
      if (!ok) setPaidFailed(true);
    },
    [onPaid]
  );
  const check = useCallback(
    async (current: PendingPayment) => {
      const status = await apiGetWithDeviceToken<StatusData>(
        `/api/v1/public/${businessSlug}/payments/${current.payment_reference}/status`,
        deviceToken
      );
      if (status.status === "paid") {
        setPaidCheckoutId(status.checkout_session_id);
        setPhase("paid");
        void openPaidSession(status.checkout_session_id);
        return "paid" as const;
      }
      if (status.status === "expired") {
        setPhase("expired");
        return "expired" as const;
      }
      return "pending" as const;
    },
    [businessSlug, deviceToken, openPaidSession]
  );
  const poll = useCallback(
    () => (payment ? check(payment) : Promise.resolve("pending" as const)),
    [check, payment]
  );
  const { left, online, stopTimers } = useQrisPolling({
    active: phase === "qris" || phase === "va" || phase === "redirect" || phase === "cash-waiting",
    expiresAt: payment?.expires_at ?? null,
    poll,
    onExpired: () => setPhase("expired"),
  });
  async function create(method: KioskPaymentMethod) {
    if (!amounts || creatingRef.current) return;
    creatingRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await apiPost<PendingPayment>(
        `/api/v1/public/${businessSlug}/payments/create`,
        {
          checkout_session_id: amounts.checkout_session_id,
          device_token: deviceToken,
          method_id: method.id,
        }
      );
      if (result.status === "paid") {
        setPaidCheckoutId(result.checkout_session_id);
        setPhase("paid");
        void openPaidSession(result.checkout_session_id);
        return;
      }
      setPayment(result);
      setPhase(
        result.display === "va"
          ? "va"
          : result.display === "redirect"
            ? "redirect"
            : result.display === "cash"
              ? "cash-waiting"
              : "qris"
      );
    } catch (cause) {
      if (cause instanceof KioskError && cause.code === "RATE_LIMITED" && cause.retryAfter > 0) {
        setLockLeft(cause.retryAfter);
      }
      setError(cause instanceof KioskError ? cause.message : "Gagal membuat payment.");
      setPhase("method-picker");
    } finally {
      creatingRef.current = false;
      setBusy(false);
    }
  }
  async function applyVoucher() {
    if (!amounts || !voucherCode.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await apiPost<Amounts>(
        `/api/v1/public/${businessSlug}/checkout/apply-voucher`,
        {
          checkout_session_id: amounts.checkout_session_id,
          voucher_code: voucherCode,
          device_token: deviceToken,
        }
      );
      setAmounts({ ...amounts, ...updated });
      if (updated.final_amount !== 0) {
        setError("Voucher belum menutup seluruh pembayaran. Pilih metode pembayaran.");
        setPhase("method-picker");
        return;
      }
      await create({
        id: "voucher",
        kind: "voucher",
        display: "voucher",
        label: "VOUCHER",
        provider: null,
        method: null,
        hint: null,
      });
    } catch (cause) {
      setError(cause instanceof KioskError ? cause.message : "Voucher tidak valid.");
    } finally {
      setBusy(false);
    }
  }
  /**
   * Kembali dari layar pembayaran ke pemilih metode.
   *
   * Payment pending lama TIDAK di-void di sini: tidak ada endpoint void dari
   * kiosk, dan `POST /payments/create` justru MENOLAK payment baru selama satu
   * payment masih menunggu (`PAYMENT_ALREADY_PROCESSED`) — itu yang menahan
   * double pay selama QR lama masih bisa dipindai. Yang menghanguskan checkout
   * lama hanya `POST /checkout`, jadi jalur "ganti metode" yang sungguhan
   * adalah kembali ke halaman package (docs/06 §6.3). Kembali ke pemilih metode
   * tetap benar saat payment sudah kedaluwarsa.
   */
  function backToMethods() {
    stopTimers();
    setPayment(null);
    setQrSrc(null);
    setError(null);
    setPhase("method-picker");
  }
  const style = kioskStyle
    ? {
        ...kioskThemeVars(kioskStyle),
        backgroundColor: kioskStyle.bg,
        color: kioskStyle.text,
        fontFamily: kioskStyle.fontFamily,
      }
    : undefined;
  // Perataan mengikuti `align` (payment_align legacy sudah diserap di
  // kioskVisualStyle), sehingga kontrol perataan global benar-benar berlaku.
  const align = kioskStyle?.align ?? "left";
  const gutter = kioskGutter(kioskStyle?.padding);
  const radius = kioskStyle?.radius ?? 0;
  /** Gaya tombol CTA utama: aksen brand + teks yang kontras. */
  const ctaStyle = kioskStyle
    ? { borderRadius: radius, backgroundColor: kioskStyle.accent, color: kioskStyle.accentText }
    : undefined;

  const inner = "mx-auto flex w-full max-w-[980px] flex-1 flex-col gap-5";
  const eyebrowText = kioskElementText(elements, "eyebrow", "CHECKOUT");
  const titleLabel = kioskElementText(elements, "title", paymentTitle || "Bayar sebelum foto");
  const hintText = kioskElementText(
    elements,
    "hint",
    paymentHint || "Sesi foto terbuka otomatis setelah pembayaran terverifikasi."
  );
  const backLabel = kioskElementText(elements, "back", "Kembali");

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col overflow-y-auto py-6 md:py-7"
      style={{ ...style, paddingLeft: gutter, paddingRight: gutter }}
    >
      <KioskVideoBackground videoUrl={videoUrl} />
      <div className={`relative z-10 ${inner}`}>
        <KioskHeader
          eyebrow={eyebrowText}
          title={titleLabel}
          description={hintText}
          align={align}
          scale={kioskStyle?.fontScale ?? 1}
          elements={elements}
          elementIds={{ eyebrow: "eyebrow", title: "title", description: "hint", actions: "back" }}
          actions={
            <KioskAction
              tone="secondary"
              size="md"
              onClick={onBack}
              kioskStyle={kioskStyle}
              className="font-mono tracking-[0.1em]"
            >
              <ArrowLeft className="size-4" aria-hidden />
              {backLabel}
            </KioskAction>
          }
        />

        {!online && phase !== "loading" && (
          <div className="flex items-center gap-2 border-2 border-ink bg-accent-2 px-3 py-2">
            <WifiOff className="size-4 shrink-0" aria-hidden />
            <p className="font-mono text-[10px] font-bold uppercase leading-tight tracking-[0.08em]">
              Offline. Status akan dicek saat koneksi kembali.
            </p>
          </div>
        )}

        {phase === "loading" && (
          <KioskCard
            className="flex flex-col justify-center gap-4 p-5"
            style={{ borderRadius: radius }}
          >
            <KioskEyebrow>{"MENYIAPKAN PEMBAYARAN"}</KioskEyebrow>
            <KioskLoading label="Menyiapkan pembayaran" rows={3} />
          </KioskCard>
        )}

        {phase === "error" && (
          <KioskCard className="flex flex-col justify-center gap-4 p-5">
            <KioskEyebrow className="text-destructive">{"CHECKOUT GAGAL"}</KioskEyebrow>
            <p className="max-w-[52ch] text-sm leading-relaxed text-muted-foreground">{error}</p>
            <div className="flex flex-wrap gap-3">
              <KioskAction tone="primary" size="md" onClick={() => void load()}>
                Coba lagi
              </KioskAction>
              <KioskAction tone="secondary" size="md" onClick={onBack}>
                Kembali
              </KioskAction>
            </div>
          </KioskCard>
        )}

        {phase === "summary" && amounts && (
          <KioskElement id="summary" defaultOrder={4} elements={elements} className="w-full">
            <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
              <KioskCard elevated className="flex flex-col gap-4 p-5 md:p-6">
                <KioskEyebrow>{"RINGKASAN PESANAN"}</KioskEyebrow>
                <KioskHeading as="h2" size="sm" scale={kioskStyle?.fontScale ?? 1}>
                  {pkg.name}
                </KioskHeading>
                <dl className="divide-y-2 divide-ink/10 border-y-2 border-ink/15 font-mono text-sm">
                  <div className="flex items-baseline justify-between gap-4 py-3">
                    <dt className="text-muted-foreground">Subtotal</dt>
                    <dd className="font-bold">{formatIDR(amounts.gross_amount)}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-4 py-3">
                    <dt className="text-muted-foreground">Diskon</dt>
                    <dd className="font-bold">-{formatIDR(amounts.discount_amount)}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-4 py-3">
                    <dt className="font-display text-base uppercase tracking-[-0.01em]">Total</dt>
                    <dd className="font-display text-xl font-bold tracking-[-0.02em] md:text-2xl">
                      {formatIDR(amounts.final_amount)}
                    </dd>
                  </div>
                </dl>
              </KioskCard>

              <div className="flex flex-col gap-3">
                <KioskAction
                  tone="primary"
                  size="xl"
                  onClick={() => setPhase("method-picker")}
                  full
                  kioskStyle={kioskStyle}
                >
                  Pilih pembayaran
                </KioskAction>
                {offlineEnabled && onOffline && (
                  <KioskAction
                    tone="secondary"
                    size="md"
                    onClick={onOffline}
                    full
                    kioskStyle={kioskStyle}
                  >
                    Lanjut offline
                  </KioskAction>
                )}
                <p className="text-center text-xs leading-relaxed text-muted-foreground">
                  Metode pembayaran mengikuti yang diaktifkan owner booth.
                </p>
              </div>
            </section>
          </KioskElement>
        )}

        {phase === "method-picker" && amounts && (
          <KioskElement id="methods" defaultOrder={5} elements={elements} className="w-full">
            <PaymentMethodPicker
              methods={amounts.payment_methods}
              disabled={busy || lockLeft > 0}
              lockLeft={lockLeft}
              error={error}
              onSelect={(method) => {
                setError(null);
                // Kartu voucher → layar input kode; metode lain → buat payment.
                if (method.kind === "voucher") {
                  setPhase("voucher");
                  return;
                }
                void create(method);
              }}
              onBack={() => {
                setError(null);
                setPhase("summary");
              }}
              kioskStyle={kioskStyle}
            />
          </KioskElement>
        )}

        {phase === "voucher" && (
          <VoucherPayment
            code={voucherCode}
            onCode={setVoucherCode}
            onApply={() => void applyVoucher()}
            onBack={() => {
              setError(null);
              setPhase("method-picker");
            }}
            busy={busy}
            error={error}
            kioskStyle={kioskStyle}
          />
        )}

        {phase === "cash-waiting" && payment && (
          <CashPayment
            amount={payment.total_amount}
            left={left}
            onCancel={() => {
              stopTimers();
              setPayment(null);
              setError(null);
              setPhase("method-picker");
            }}
            kioskStyle={kioskStyle}
          />
        )}

        {phase === "qris" && payment && (
          <QrisPayment
            payment={payment}
            qrSrc={qrSrc}
            left={left}
            online={online}
            onBack={backToMethods}
            kioskStyle={kioskStyle}
          />
        )}

        {phase === "va" && payment && (
          <VaPayment payment={payment} left={left} onBack={backToMethods} kioskStyle={kioskStyle} />
        )}

        {phase === "redirect" && payment && (
          <KioskCard elevated className="flex flex-col justify-center gap-4 p-5">
            <KioskEyebrow>{"LANJUTKAN PEMBAYARAN"}</KioskEyebrow>
            <KioskHeading as="h2" size="sm" scale={kioskStyle?.fontScale ?? 1}>
              Buka aplikasi pembayaran
            </KioskHeading>
            {payment.payment_url ? (
              <a
                href={payment.payment_url}
                className="inline-flex min-h-14 w-fit items-center justify-center border-2 border-ink px-6 py-3 font-display text-base font-bold uppercase tracking-[-0.01em] shadow-hard"
                style={ctaStyle}
              >
                Lanjut bayar
              </a>
            ) : (
              <p className="text-sm text-muted-foreground">Link pembayaran tidak tersedia.</p>
            )}
            <KioskAction tone="secondary" size="md" onClick={backToMethods} className="w-fit">
              <ArrowLeft className="size-4" aria-hidden />
              Kembali
            </KioskAction>
          </KioskCard>
        )}

        {phase === "expired" && (
          <KioskCard elevated className="flex flex-col justify-center gap-4 p-5">
            <KioskEyebrow className="text-destructive">{"WAKTU HABIS"}</KioskEyebrow>
            <KioskHeading as="h2" size="sm" scale={kioskStyle?.fontScale ?? 1}>
              Pembayaran kedaluwarsa
            </KioskHeading>
            <p className="max-w-[52ch] text-sm leading-relaxed text-muted-foreground">
              Sesi belum terpakai. Pilih paket lagi untuk membuat pembayaran baru.
            </p>
            <KioskAction tone="primary" size="md" onClick={onBack} className="w-fit">
              <ArrowLeft className="size-4" aria-hidden />
              Kembali ke paket
            </KioskAction>
          </KioskCard>
        )}

        {phase === "paid" && (
          <PaidNotice
            busy={!paidFailed}
            kioskStyle={kioskStyle}
            onRetry={paidCheckoutId ? () => void openPaidSession(paidCheckoutId) : undefined}
          />
        )}
      </div>
    </div>
  );
}
