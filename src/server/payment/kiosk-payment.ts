/** Shared kiosk payment behavior (pure — no server runtime deps).
 *  Dipindah dari `src/lib/kiosk-payment.ts` (Fase 5). Konsumen 100% server
 *  (payment-methods, payment-create, qris) + test kiosk-payment-methods.
 */

import { PAYMENT_METHODS, type PaymentMethodCode } from "../../lib/payment-credentials.ts";
import type { KioskPaymentDisplay, KioskPaymentMethod } from "@/lib/kiosk-types";

export type { KioskPaymentDisplay, KioskPaymentKind, KioskPaymentMethod } from "@/lib/kiosk-types";
type KioskGatewayProvider = "midtrans" | "tripay" | "pakasir";

type DirectCredential = {
  provider: "midtrans" | "tripay" | "pakasir";
  enabledMethods: readonly string[];
};

type DisplayTable<P extends KioskGatewayProvider> = Record<
  PaymentMethodCode<P>,
  KioskPaymentDisplay
>;

/**
 * Tampilan kiosk per metode, ekshaustif terhadap `PAYMENT_METHODS`. Menambah
 * metode baru tanpa menentukan tampilannya = type error, bukan fallback diam-diam
 * ke QR (yang dulu menampilkan QR untuk transaksi VA/redirect).
 */
const METHOD_DISPLAY: { [P in KioskGatewayProvider]: DisplayTable<P> } = {
  midtrans: {
    qris: "qris",
    gopay: "redirect",
    shopeepay: "redirect",
    bca: "va",
    bni: "va",
    bri: "va",
    permata: "va",
  },
  tripay: {
    QRIS: "qris",
    BCAVA: "va",
    BNIVA: "va",
    BRIVA: "va",
    MANDIRIVA: "va",
    PERMATAVA: "va",
    ALFAMART: "redirect",
    INDOMARET: "redirect",
  },
  pakasir: { qris: "qris" },
};

/** Peta `METHOD.toUpperCase()` → ejaan kanonik `PAYMENT_METHODS` per provider. */
const METHOD_LOOKUP: Record<KioskGatewayProvider, Map<string, string>> = {
  midtrans: new Map(PAYMENT_METHODS.midtrans.map((method) => [method.toUpperCase(), method])),
  tripay: new Map(PAYMENT_METHODS.tripay.map((method) => [method.toUpperCase(), method])),
  pakasir: new Map(PAYMENT_METHODS.pakasir.map((method) => [method.toUpperCase(), method])),
};

/**
 * Satu pintu normalisasi metode: input apa pun (case beda / string sampah
 * dari metadata lama) → ejaan kanonik provider. Metode tak dikenal DITOLAK
 * dengan pesan jelas; tidak ada fallback diam-diam ke "qris" yang bisa
 * menagih lewat kanal berbeda dari pilihan customer.
 */
export function normalizePaymentMethod(provider: KioskGatewayProvider, method: string): string {
  const canonical = METHOD_LOOKUP[provider].get(method.trim().toUpperCase());
  if (!canonical) {
    throw new Error(
      `Metode pembayaran "${method}" tidak dikenal untuk provider ${provider}. ` +
        `Pilihan valid: ${PAYMENT_METHODS[provider].join(", ")}.`
    );
  }
  return canonical;
}

export function paymentMethodId(provider: KioskGatewayProvider, method: string): string {
  return `${provider}:${normalizePaymentMethod(provider, method)}`;
}

export function paymentDisplay(
  provider: KioskGatewayProvider,
  method: string
): KioskPaymentDisplay {
  const canonical = normalizePaymentMethod(provider, method);
  const display = (METHOD_DISPLAY[provider] as Record<string, KioskPaymentDisplay>)[canonical];
  if (!display) {
    throw new Error(`Tampilan pembayaran "${canonical}" belum didefinisikan untuk ${provider}.`);
  }
  return display;
}

function paymentLabel(provider: KioskGatewayProvider, method: string): string {
  const canonical = normalizePaymentMethod(provider, method);
  if (canonical === "qris" || canonical === "QRIS") {
    return provider === "pakasir" ? "QRIS PAKASIR" : "QRIS";
  }
  return canonical.toUpperCase();
}

/** Metode online hanya dari credential owner; kosong → voucher + cash (no aggregator fallback). */
export function buildKioskPaymentMethods(
  credentials: readonly DirectCredential[]
): KioskPaymentMethod[] {
  const online = credentials.flatMap(({ provider, enabledMethods }) =>
    [...new Set(enabledMethods)].map((method) => ({
      id: paymentMethodId(provider, method),
      kind: "gateway" as const,
      display: paymentDisplay(provider, method),
      label: paymentLabel(provider, method),
      provider,
      method: normalizePaymentMethod(provider, method),
      hint: "Gateway merchant",
    }))
  );
  return [
    ...online,
    {
      id: "voucher",
      kind: "voucher",
      display: "voucher",
      label: "VOUCHER",
      provider: null,
      method: null,
      hint: "Kode promo atau sesi gratis",
    },
    {
      id: "cash",
      kind: "cash",
      display: "cash",
      label: "BAYAR DI KASIR",
      provider: null,
      method: null,
      hint: "Konfirmasi petugas diperlukan",
    },
  ];
}

/**
 * Checkout bersisa nol (voucher 100%/diskon penuh) tidak punya tagihan untuk
 * gateway, jadi kanal voucher wajib tetap ditawarkan walau booth difilter ke
 * "hanya gateway". Tanpa ini customer terjebak pada pembayaran tunai Rp0.
 * Murni agar bisa diuji tanpa DB.
 */
export function ensureFreeSettlementMethod(
  filtered: readonly KioskPaymentMethod[],
  all: readonly KioskPaymentMethod[],
  finalAmount: number | undefined
): KioskPaymentMethod[] {
  if (finalAmount === undefined || finalAmount > 0) return [...filtered];
  if (filtered.some((method) => method.kind === "voucher")) return [...filtered];
  return [...filtered, ...all.filter((method) => method.kind === "voucher")];
}

export type PhotoboxPaymentMode = "gateway" | "voucher" | null;

/** Per-booth channel filter (0055): null = keduanya; gateway/voucher = sembunyikan lawannya. */
export function filterKioskPaymentMethods(
  methods: readonly KioskPaymentMethod[],
  mode: PhotoboxPaymentMode
): KioskPaymentMethod[] {
  if (mode === "gateway") return methods.filter((m) => m.kind !== "voucher");
  if (mode === "voucher") return methods.filter((m) => m.kind !== "gateway");
  return [...methods];
}

export type KioskPaymentPayload = {
  display: Exclude<KioskPaymentDisplay, "voucher" | "cash">;
  method: string;
  qrString: string | null;
  qrImageUrl: string | null;
  paymentUrl: string | null;
  vaNumber: string | null;
};

export function encodeKioskPaymentPayload(payload: KioskPaymentPayload): string {
  return JSON.stringify(payload);
}

export function decodeKioskPaymentPayload(value: string | null): KioskPaymentPayload | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<KioskPaymentPayload>;
    if (
      (parsed.display !== "qris" && parsed.display !== "va" && parsed.display !== "redirect") ||
      typeof parsed.method !== "string"
    )
      return null;
    return {
      display: parsed.display,
      method: parsed.method,
      qrString: typeof parsed.qrString === "string" ? parsed.qrString : null,
      qrImageUrl: typeof parsed.qrImageUrl === "string" ? parsed.qrImageUrl : null,
      paymentUrl: typeof parsed.paymentUrl === "string" ? parsed.paymentUrl : null,
      vaNumber: typeof parsed.vaNumber === "string" ? parsed.vaNumber : null,
    };
  } catch {
    return null;
  }
}
