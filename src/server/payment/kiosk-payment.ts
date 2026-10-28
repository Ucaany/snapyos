/** Shared kiosk payment behavior (pure — no server runtime deps).
 *  Dipindah dari `src/lib/kiosk-payment.ts` (Fase 5). Konsumen 100% server
 *  (payment-methods, payment-create, qris) + test kiosk-payment-methods.
 */

import type { KioskPaymentDisplay, KioskPaymentMethod } from "@/lib/kiosk-types";

export type { KioskPaymentDisplay, KioskPaymentKind, KioskPaymentMethod } from "@/lib/kiosk-types";
type KioskGatewayProvider = "midtrans" | "tripay" | "pakasir";

type DirectCredential = {
  provider: "midtrans" | "tripay" | "pakasir";
  enabledMethods: readonly string[];
};

const MIDTRANS_VA = new Set(["bca", "bni", "bri", "mandiri", "permata"]);
const MIDTRANS_REDIRECT = new Set(["gopay", "shopeepay"]);
const TRIPAY_VA = new Set(["BCAVA", "BNIVA", "BRIVA", "MANDIRIVA", "PERMATAVA"]);
const TRIPAY_REDIRECT = new Set(["ALFAMART", "INDOMARET"]);

export function paymentMethodId(provider: KioskGatewayProvider, method: string): string {
  return `${provider}:${method}`;
}

export function paymentDisplay(
  provider: KioskGatewayProvider,
  method: string
): KioskPaymentDisplay {
  if (provider === "pakasir" || method.toLowerCase() === "qris") return "qris";
  if (provider === "midtrans") {
    if (MIDTRANS_VA.has(method.toLowerCase())) return "va";
    if (MIDTRANS_REDIRECT.has(method.toLowerCase())) return "redirect";
    return "qris";
  }
  if (TRIPAY_VA.has(method.toUpperCase())) return "va";
  if (TRIPAY_REDIRECT.has(method.toUpperCase())) return "redirect";
  return "qris";
}

function paymentLabel(provider: KioskGatewayProvider, method: string): string {
  if (method.toLowerCase() === "qris") return provider === "pakasir" ? "QRIS PAKASIR" : "QRIS";
  return method.toUpperCase();
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
      method,
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
