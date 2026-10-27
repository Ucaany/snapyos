/**
 * Midtrans Core API adapter — Phase 1 (electron-kiosk-plan §Phase 1).
 * Core API (BUKAN Snap): POST /v2/charge, GET /v2/{orderId}/status.
 * Auth: Basic base64(`${serverKey}:`).
 * Signature webhook: SHA512(order_id + status_code + gross_amount + serverKey).
 * NO "server-only" — pure, testable.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import type {
  PaymentGateway,
  GatewayCreateResult,
  GatewayStatus,
  GatewayCredential,
} from "./types";

const PROD_BASE = "https://api.midtrans.com";
const SANDBOX_BASE = "https://api.sandbox.midtrans.com";

function baseUrl(env: string): string {
  return env === "production" ? PROD_BASE : SANDBOX_BASE;
}

function authHeader(serverKey: string): string {
  return `Basic ${Buffer.from(`${serverKey}:`).toString("base64")}`;
}

/**
 * `fraud_status` hanya ada untuk transaksi kartu (docs Midtrans reference
 * /fraud-status). Untuk QRIS/e-wallet/VA, notifikasi `settlement` tidak membawa
 * `fraud_status` sama sekali. "Tidak ada fraud_status" ≠ "fraud_status bukan
 * accept": menolaknya akan membuat pembayaran QRIS yang sah tidak pernah
 * di-settle. Nilai tidak dikenal tetap fail-closed (bukan paid), dan
 * `fraud_status: "deny"` tetap selalu ditolak.
 */
export function isMidtransFraudAccepted(fraudStatus?: string | null): boolean {
  if (fraudStatus === null || fraudStatus === undefined) return true;
  return String(fraudStatus).trim().toLowerCase() === "accept";
}

/** Map Midtrans transaction_status → GatewayStatus. */
export function mapMidtransStatus(
  transactionStatus: string,
  fraudStatus?: string | null
): GatewayStatus {
  const s = transactionStatus.toLowerCase();
  if (s === "capture" || s === "settlement") {
    return isMidtransFraudAccepted(fraudStatus) ? "paid" : "failed";
  }
  if (s === "pending") return "pending";
  if (s === "deny" || s === "cancel") return "failed";
  if (s === "expire") return "expired";
  return "pending";
}

/** SHA512 webhook signature: SHA512(order_id + status_code + gross_amount + serverKey). */
export function computeMidtransSignature(
  orderId: string,
  statusCode: string,
  grossAmount: string,
  serverKey: string
): string {
  return createHash("sha512")
    .update(`${orderId}${statusCode}${grossAmount}${serverKey}`)
    .digest("hex");
}

export function createMidtransGateway(credential: GatewayCredential): PaymentGateway {
  const base = baseUrl(credential.environment);
  const auth = authHeader(credential.serverKey);

  return {
    provider: "midtrans",

    async createTransaction(input) {
      if (!Number.isInteger(input.amount) || input.amount <= 0) {
        throw new Error("Amount harus integer IDR positif");
      }
      const requestedMethod = input.paymentMethods?.[0]?.toLowerCase() ?? "qris";
      const bankTransfer = ["bca", "bni", "bri", "permata"].includes(requestedMethod);
      const ewallet = requestedMethod === "gopay" || requestedMethod === "shopeepay";
      const body: Record<string, unknown> = {
        payment_type: bankTransfer ? "bank_transfer" : ewallet ? requestedMethod : "qris",
        transaction_details: {
          order_id: input.orderId,
          gross_amount: input.amount,
        },
        custom_expiry: { expiry_duration: 60, unit: "minute" },
        ...(bankTransfer ? { bank_transfer: { bank: requestedMethod } } : {}),
        ...(requestedMethod === "gopay"
          ? { gopay: { enable_callback: true, callback_url: input.returnUrl ?? input.callbackUrl } }
          : requestedMethod === "shopeepay"
            ? { shopeepay: { callback_url: input.returnUrl ?? input.callbackUrl } }
            : {}),
      };
      if (input.customerEmail || input.customerName) {
        body.customer_details = {
          ...(input.customerName ? { first_name: input.customerName } : {}),
          ...(input.customerEmail ? { email: input.customerEmail } : {}),
        };
      }
      const res = await fetch(`${base}/v2/charge`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: auth,
          Accept: "application/json",
        },
        body: JSON.stringify(body),
        cache: "no-store" as RequestCache,
      });
      const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!res.ok || !json) {
        throw new Error(`Midtrans charge gagal: ${res.status} ${JSON.stringify(json)}`);
      }
      const responseOrderId = typeof json.order_id === "string" ? json.order_id : "";
      const responseAmount = Number(json.gross_amount ?? input.amount);
      if (
        responseOrderId !== input.orderId ||
        !Number.isInteger(responseAmount) ||
        responseAmount !== input.amount
      ) {
        throw new Error("Respons Midtrans tidak cocok dengan order atau nominal server.");
      }
      const actions = (Array.isArray(json.actions) ? json.actions : []) as {
        name?: string;
        url?: string;
      }[];
      const qrAction = actions.find((a) => a.name === "generate-qr-code");
      const redirectAction = actions.find((a) => /redirect|deeplink/i.test(a.name ?? ""));
      const vaNumbers = Array.isArray(json.va_numbers)
        ? (json.va_numbers as { va_number?: unknown }[])
        : [];
      const vaNumber = typeof vaNumbers[0]?.va_number === "string" ? vaNumbers[0].va_number : null;
      return {
        orderId: responseOrderId,
        amount: responseAmount,
        totalAmount: input.amount,
        qrString: typeof json.qr_string === "string" ? json.qr_string : null,
        qrImageUrl: qrAction?.url ?? null,
        paymentUrl:
          typeof json.redirect_url === "string" ? json.redirect_url : (redirectAction?.url ?? null),
        vaNumber,
        expiresAt: typeof json.expiry_time === "string" ? json.expiry_time : null,
        providerRef: String(json.transaction_id ?? ""),
      } satisfies GatewayCreateResult;
    },

    async getStatus(orderId, amount) {
      const res = await fetch(`${base}/v2/${encodeURIComponent(orderId)}/status`, {
        headers: { Authorization: auth, Accept: "application/json" },
        cache: "no-store" as RequestCache,
      });
      const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!json) return "pending";
      const status = mapMidtransStatus(
        String(json.transaction_status ?? "pending"),
        typeof json.fraud_status === "string" ? json.fraud_status : null
      );
      // Defense-in-depth: nominal provider harus cocok bila amount diminta.
      if (status === "paid" && amount !== undefined) {
        const gross = Number(json.gross_amount);
        if (!Number.isInteger(gross) || gross !== amount) return "pending";
      }
      return status;
    },

    verifyWebhook(payload: unknown, signature: string): boolean {
      if (!payload || typeof payload !== "object") return false;
      const p = payload as Record<string, unknown>;
      const orderId = String(p.order_id ?? "");
      const statusCode = String(p.status_code ?? "");
      const grossAmount = String(p.gross_amount ?? "");
      if (!orderId || !statusCode || !grossAmount) return false;
      const expected = computeMidtransSignature(
        orderId,
        statusCode,
        grossAmount,
        credential.serverKey
      );
      try {
        return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
      } catch {
        return false;
      }
    },

    async cancelTransaction(orderId: string): Promise<boolean> {
      const res = await fetch(`${base}/v2/${encodeURIComponent(orderId)}/cancel`, {
        method: "POST",
        headers: { Authorization: auth, Accept: "application/json" },
        cache: "no-store" as RequestCache,
      });
      return res.ok;
    },
  };
}
