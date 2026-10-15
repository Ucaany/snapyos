"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import QRCode from "qrcode"
import { ArrowLeft, Loader2, WifiOff } from "lucide-react"
import type { KioskPaymentMethod, KioskVisualStyle, PublicPackage } from "@/lib/kiosk-types"
import { formatIDR } from "@/lib/dashboard-math"
import { apiGet, apiPost, KioskError } from "@/components/kiosk/api"
import { useQrisPolling } from "@/hooks/use-qris-polling"
import { CashPayment } from "./CashPayment"
import { PaymentMethodPicker } from "./PaymentMethodPicker"
import { PaidNotice, QrisPayment, type PendingPayment } from "./QrisPayment"
import { VaPayment } from "./VaPayment"
import { VoucherPayment } from "./VoucherPayment"

type Amounts = {
  checkout_session_id: string
  gross_amount: number
  discount_amount: number
  final_amount: number
  payment_methods: KioskPaymentMethod[]
}
type StatusData = { status: "pending" | "paid" | "expired"; checkout_session_id: string }
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
  | "error"
type Props = {
  businessSlug: string
  pkg: PublicPackage
  deviceToken: string
  paymentTitle?: string
  paymentHint?: string
  paymentAlign?: "left" | "center"
  kioskStyle?: KioskVisualStyle
  offlineEnabled?: boolean
  onOffline?(): void
  /** Membuka sesi dari checkout paid. false = gagal; layar menawarkan ulang. */
  onPaid(checkoutId: string): Promise<boolean>
  onBack(): void
}
const button =
  "inline-flex min-h-11 items-center justify-center border-2 border-ink bg-bg px-4 py-2 font-mono text-xs font-bold uppercase shadow-[3px_3px_0_0_#111111] transition-transform active:translate-y-[2px] disabled:opacity-50 disabled:shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
const backButton = `w-fit gap-2 ${button}`

export function CheckoutScreen({
  businessSlug,
  pkg,
  deviceToken,
  paymentTitle,
  paymentHint,
  paymentAlign,
  kioskStyle,
  offlineEnabled = false,
  onOffline,
  onPaid,
  onBack,
}: Props) {
  const [amounts, setAmounts] = useState<Amounts | null>(null)
  const [phase, setPhase] = useState<Phase>("loading")
  const [payment, setPayment] = useState<PendingPayment | null>(null)
  const [qrSrc, setQrSrc] = useState<string | null>(null)
  const [voucherCode, setVoucherCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Checkout id dari payment yang sudah paid — tombol coba lagi di layar "paid"
  // memanggil ulang onPaid dengan id yang sama (idempoten, lihat KioskApp).
  const [paidCheckoutId, setPaidCheckoutId] = useState<string | null>(null)
  const [paidFailed, setPaidFailed] = useState(false)
  // Kunci tombol bayar selama `details.retry_after` (docs/06 §6.3) — tanpa ini
  // customer yang menekan berulang saat 429 hanya menambah beban dan berisiko
  // double pay begitu limit lewat.
  const [lockLeft, setLockLeft] = useState(0)
  // Guard ref, bukan state: dua tap cepat dalam satu render masih membaca
  // `busy` lama (state baru terlihat setelah re-render), jadi state saja tidak
  // menahan POST /payments/create kedua.
  const creatingRef = useRef(false)
  // Hitung mundur kunci rate-limit; 0 = tombol bayar aktif.
  useEffect(() => {
    if (lockLeft <= 0) return
    const t = setInterval(() => setLockLeft((v) => (v <= 1 ? 0 : v - 1)), 1000)
    return () => clearInterval(t)
  }, [lockLeft])
  const load = useCallback(async () => {
    setPhase("loading")
    setError(null)
    try {
      const data = await apiPost<Amounts>(`/api/v1/public/${businessSlug}/checkout`, {
        package_id: pkg.id,
        device_token: deviceToken,
      })
      setAmounts(data)
      setPhase("summary")
    } catch (cause) {
      setError(cause instanceof KioskError ? cause.message : "Gagal memuat checkout.")
      setPhase("error")
    }
  }, [businessSlug, deviceToken, pkg.id])
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0)
    return () => clearTimeout(timer)
  }, [load])
  useEffect(() => {
    const source = payment?.qr_string ?? payment?.qr_image ?? payment?.qr_url ?? null
    const timer = setTimeout(() => {
      if (!source) {
        setQrSrc(null)
        return
      }
      if (source.startsWith("data:") || source.startsWith("http")) {
        setQrSrc(source)
        return
      }
      void QRCode.toDataURL(source, { errorCorrectionLevel: "M", width: 400, margin: 2 })
        .then(setQrSrc)
        .catch(() => setQrSrc(null))
    }, 0)
    return () => clearTimeout(timer)
  }, [payment])
  /** Buka sesi dari checkout yang sudah paid. Gagal = tawarkan ulang, bukan
   *  layar berputar selamanya (uang customer sudah masuk di titik ini). */
  const openPaidSession = useCallback(
    async (checkoutId: string) => {
      setPaidFailed(false)
      const ok = await onPaid(checkoutId)
      if (!ok) setPaidFailed(true)
    },
    [onPaid]
  )
  const check = useCallback(
    async (current: PendingPayment) => {
      const status = await apiGet<StatusData>(
        `/api/v1/public/${businessSlug}/payments/${current.payment_reference}/status?device_token=${encodeURIComponent(deviceToken)}`
      )
      if (status.status === "paid") {
        setPaidCheckoutId(status.checkout_session_id)
        setPhase("paid")
        void openPaidSession(status.checkout_session_id)
        return "paid" as const
      }
      if (status.status === "expired") {
        setPhase("expired")
        return "expired" as const
      }
      return "pending" as const
    },
    [businessSlug, deviceToken, openPaidSession]
  )
  const poll = useCallback(
    () => (payment ? check(payment) : Promise.resolve("pending" as const)),
    [check, payment]
  )
  const { left, online, stopTimers } = useQrisPolling({
    active: phase === "qris" || phase === "va" || phase === "redirect" || phase === "cash-waiting",
    expiresAt: payment?.expires_at ?? null,
    poll,
    onExpired: () => setPhase("expired"),
  })
  async function create(method: KioskPaymentMethod) {
    if (!amounts || creatingRef.current) return
    creatingRef.current = true
    setBusy(true)
    setError(null)
    try {
      const result = await apiPost<PendingPayment>(
        `/api/v1/public/${businessSlug}/payments/create`,
        {
          checkout_session_id: amounts.checkout_session_id,
          device_token: deviceToken,
          method_id: method.id,
        }
      )
      if (result.status === "paid") {
        setPaidCheckoutId(result.checkout_session_id)
        setPhase("paid")
        void openPaidSession(result.checkout_session_id)
        return
      }
      setPayment(result)
      setPhase(
        result.display === "va"
          ? "va"
          : result.display === "redirect"
            ? "redirect"
            : result.display === "cash"
              ? "cash-waiting"
              : "qris"
      )
    } catch (cause) {
      if (cause instanceof KioskError && cause.code === "RATE_LIMITED" && cause.retryAfter > 0) {
        setLockLeft(cause.retryAfter)
      }
      setError(cause instanceof KioskError ? cause.message : "Gagal membuat payment.")
      setPhase("method-picker")
    } finally {
      creatingRef.current = false
      setBusy(false)
    }
  }
  async function applyVoucher() {
    if (!amounts || !voucherCode.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const updated = await apiPost<Amounts>(
        `/api/v1/public/${businessSlug}/checkout/apply-voucher`,
        {
          checkout_session_id: amounts.checkout_session_id,
          voucher_code: voucherCode,
          device_token: deviceToken,
        }
      )
      setAmounts({ ...amounts, ...updated })
      if (updated.final_amount !== 0) {
        setError("Voucher belum menutup seluruh pembayaran. Pilih metode pembayaran.")
        setPhase("method-picker")
        return
      }
      await create({
        id: "voucher",
        kind: "voucher",
        display: "voucher",
        label: "VOUCHER",
        provider: null,
        method: null,
        hint: null,
      })
    } catch (cause) {
      setError(cause instanceof KioskError ? cause.message : "Voucher tidak valid.")
    } finally {
      setBusy(false)
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
    stopTimers()
    setPayment(null)
    setQrSrc(null)
    setError(null)
    setPhase("method-picker")
  }
  const style = kioskStyle
    ? {
        backgroundColor: kioskStyle.bg,
        color: kioskStyle.text,
        paddingLeft: kioskStyle.padding,
        paddingRight: kioskStyle.padding,
      }
    : undefined
  // Perataan: payment_align legacy menang bila diset; fallback ke align global.
  const effectiveAlign = paymentAlign ?? (kioskStyle?.align === "left" || kioskStyle?.align === "right" ? "left" : "center")
  const align = effectiveAlign === "center" ? "items-center text-center" : "items-start text-left"
  return (
    <div className="relative flex min-h-[100dvh] flex-1 flex-col gap-4 overflow-hidden bg-bg px-4 pt-5 pb-16" style={style}>
      <header className={`relative z-10 mx-auto flex w-full max-w-[1000px] flex-col gap-1 ${align}`}>
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-ink/70">
          [ CHECKOUT ]
        </p>
        <h1
          className="font-display text-3xl uppercase leading-[0.9] tracking-tight"
          style={kioskStyle ? { fontFamily: kioskStyle.fontFamily, fontSize: `${1.875 * kioskStyle.fontScale}rem` } : undefined}
        >
          {paymentTitle || "Bayar sebelum foto"}
        </h1>
        {paymentHint && <p>{paymentHint}</p>}
      </header>
      {!online && phase !== "loading" && (
        <div className="mx-auto flex w-full max-w-[1000px] items-center gap-2 border-2 border-ink bg-accent-2 p-2">
          <WifiOff className="size-4" />
          <p className="font-mono text-[10px] font-bold uppercase">
             Offline. Status akan dicek saat koneksi kembali.
          </p>
        </div>
      )}
      {phase === "loading" && (
        <div className="mx-auto flex min-h-[50dvh] w-full max-w-[1000px] flex-1 items-center gap-3 border-2 border-dashed border-ink/40 bg-surface p-6">
          <Loader2 className="size-6 animate-spin" />
          <p className="font-mono text-sm font-bold uppercase">[ MENYIAPKAN PEMBAYARAN ]</p>
        </div>
      )}
      {phase === "error" && (
        <div className="mx-auto flex min-h-[50dvh] w-full max-w-[1000px] flex-1 flex-col justify-center gap-4 border-2 border-ink bg-accent-2 p-6 shadow-[4px_4px_0_0_#111111]">
          <p className="font-mono text-sm font-bold uppercase">[ ERROR ]</p>
          <p>{error}</p>
          <div className="flex gap-3">
            <button type="button" onClick={() => void load()} className={button}>
              Coba lagi
            </button>
            <button type="button" onClick={onBack} className={button}>
              Kembali
            </button>
          </div>
        </div>
      )}
      {phase === "summary" && amounts && (
        <section className="mx-auto flex w-full max-w-[700px] flex-1 flex-col justify-center gap-4 border-2 border-ink bg-surface p-6 shadow-[4px_4px_0_0_#111111]">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em]">
            [ RINGKASAN PESANAN ]
          </p>
          <h2 className="font-display text-3xl uppercase leading-[0.9]">{pkg.name}</h2>
          <dl className="border-y-2 border-ink py-3 font-mono text-sm uppercase">
            <div className="flex justify-between">
              <dt>Subtotal</dt>
              <dd>{formatIDR(amounts.gross_amount)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Diskon</dt>
              <dd>-{formatIDR(amounts.discount_amount)}</dd>
            </div>
            <div className="mt-2 flex justify-between border-t-2 border-ink pt-2 text-xl font-bold">
              <dt>Total</dt>
              <dd>{formatIDR(amounts.final_amount)}</dd>
            </div>
          </dl>
          <button
            type="button"
            onClick={() => setPhase("method-picker")}
            className="w-fit border-2 border-ink bg-accent px-5 py-3 font-display text-lg uppercase shadow-[4px_4px_0_0_#111111] active:translate-y-[2px]"
          >
            Pilih pembayaran
          </button>
          <div className="flex flex-wrap gap-3">
            {offlineEnabled && onOffline && (
              <button type="button" onClick={onOffline} className={`${button} w-fit`}>
                Lanjut offline
              </button>
            )}
            <button type="button" onClick={onBack} className={backButton}>
              <ArrowLeft className="size-4" />
              Kembali
            </button>
          </div>
        </section>
      )}
      {phase === "method-picker" && amounts && (
          <PaymentMethodPicker
            methods={amounts.payment_methods}
            disabled={busy || lockLeft > 0}
            lockLeft={lockLeft}
            error={error}
            onSelect={(method) => {
              setError(null)
              // Kartu voucher → layar input kode; metode lain → buat payment.
              if (method.kind === "voucher") {
                setPhase("voucher")
                return
              }
              void create(method)
            }}
            onBack={() => {
              setError(null)
              setPhase("summary")
            }}
          />
      )}
      {phase === "voucher" && (
        <VoucherPayment
          code={voucherCode}
          onCode={setVoucherCode}
          onApply={() => void applyVoucher()}
          onBack={() => {
            setError(null)
            setPhase("method-picker")
          }}
          busy={busy}
          error={error}
        />
      )}
      {phase === "cash-waiting" && payment && (
        <CashPayment
          amount={payment.total_amount}
          left={left}
          onCancel={() => {
            stopTimers()
            setPayment(null)
            setError(null)
            setPhase("method-picker")
          }}
        />
      )}
      {phase === "qris" && payment && (
        <QrisPayment
          payment={payment}
          qrSrc={qrSrc}
          left={left}
          online={online}
          onBack={backToMethods}
        />
      )}
      {phase === "va" && payment && (
        <VaPayment payment={payment} left={left} onBack={backToMethods} />
      )}
      {phase === "redirect" && payment && (
        <div className="mx-auto flex w-full max-w-[700px] flex-1 flex-col justify-center gap-4 border-2 border-ink bg-accent p-6 shadow-[4px_4px_0_0_#111111]">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em]">
            [ LANJUTKAN PEMBAYARAN ]
          </p>
          <h2 className="font-display text-3xl uppercase leading-[0.9]">
            Buka aplikasi pembayaran
          </h2>
          {payment.payment_url ? (
            <a
              href={payment.payment_url}
              className="w-fit border-2 border-ink bg-surface px-5 py-3 font-display text-lg uppercase shadow-[4px_4px_0_0_#111111]"
            >
              Lanjut bayar
            </a>
          ) : (
            <p>Link pembayaran tidak tersedia.</p>
          )}
          <button type="button" onClick={backToMethods} className={backButton}>
            <ArrowLeft className="size-4" />
            Kembali
          </button>
        </div>
      )}
      {phase === "expired" && (
        <div className="mx-auto flex min-h-[50dvh] w-full max-w-[700px] flex-1 flex-col justify-center gap-4 border-2 border-ink bg-accent-2 p-6 shadow-[4px_4px_0_0_#111111]">
          <p className="font-mono text-sm font-bold uppercase">[ WAKTU HABIS ]</p>
           <h2 className="font-display text-3xl uppercase">Pembayaran kedaluwarsa</h2>
          <button type="button" onClick={onBack} className={`${button} w-fit`}>
            <ArrowLeft className="mr-2 inline size-4" />
            Kembali
          </button>
        </div>
      )}
      {phase === "paid" && (
        <PaidNotice
          busy={!paidFailed}
          onRetry={
            paidCheckoutId
              ? () => void openPaidSession(paidCheckoutId)
              : undefined
          }
        />
      )}
    </div>
  )
}
