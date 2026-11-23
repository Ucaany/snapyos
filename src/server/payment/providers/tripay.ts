/**
 * Tripay Closed Transaction adapter — Phase 1 (electron-kiosk-plan §Phase 1).
 * Base: https://tripay.co.id/api (prod) / https://tripay.co.id/api-sandbox (sandbox).
 * Auth: Bearer {apiKey}.
 *
 * KONVENSI KOLOM TRIPAY 3-SECRET (keputusan desain Phase 1):
 *   Tripay membutuhkan 3 rahasia: api_key, private_key, merchant_code.
 *   Penyimpanan di payment_credentials:
 *     - merchant_id       = merchant_code
 *     - server_key_encrypted = api_key (AES-256-GCM encrypted)
 *     - metadata.private_key = private_key (PLAINTEXT in-memory via GatewayCredential.metadata)
 *       Registry HARUS decrypt metadata.private_key_encrypted → metadata.private_key
 *       SEBELUM membangun adapter.
 *   Alasan: tidak menambah kolom baru (payment_credentials sudah cukup + jsonb metadata
 *   untuk field tambahan). private_key_encrypted disimpan AES-256-GCM di metadata jsonb.
 *
 * Webhook signature: HMAC-SHA256(rawBodyString, privateKey).
 *   verifyWebhook HARUS menerima rawBody string, BUKAN objek terparse
 *   (JSON re-serialize merusak HMAC — whitespace/ordering bisa beda).
 *
 * NO "server-only" — pure, testable.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  PaymentGateway,
  GatewayCreateResult,
  GatewayStatus,
  GatewayCredential,
} from "./types";

const PROD_BASE = "https://tripay.co.id/api";
const SANDBOX_BASE = "https://tripay.co.id/api-sandbox";

function baseUrl(env: string): string {
  return env === "production" ? PROD_BASE : SANDBOX_BASE;
}

/** Map Tripay status → GatewayStatus. */
export function mapTripayStatus(status: string): GatewayStatus {
  const s = status.toUpperCase();
  if (s === "PAID") return "paid";
  if (s === "UNPAID") return "pending";
  if (s === "EXPIRED") return "expired";
  if (s === "FAILED") return "failed";
  if (s === "REFUND") return "failed";
  return "pending";
}

/** HMAC-SHA256 webhook signature. */
export function computeTripaySignature(rawBody: string, privateKey: string): string {
  return createHmac("sha256", privateKey).update(rawBody).digest("hex");
}

export function createTripayGateway(credential: GatewayCredential): PaymentGateway {
  const base = baseUrl(credential.environment);
  const apiKey = credential.serverKey;
  const merchantCode = credential.merchantId;
  const privateKey =
    typeof credential.metadata.private_key === "string" ? credential.metadata.private_key : "";
  if (!privateKey) {
    throw new Error("Tripay private_key tidak ditemukan di credential metadata.");
  }

  return {
    provider: "tripay",

    async createTransaction(input) {
      if (!Number.isInteger(input.amount) || input.amount <= 0) {
        throw new Error("Amount harus integer IDR positif");
      }
      // Closed transaction — amount tetap.
      const method = input.paymentMethods?.[0] ?? "QRIS";
      const body = {
        method,
        merchant_ref: input.orderId,
        amount: input.amount,
        customer_name: input.customerName ?? "Customer",
        customer_email: input.customerEmail ?? "customer@snapyos.biz.id",
        order_items: [
          {
            name: input.description,
            price: input.amount,
            quantity: 1,
          },
        ],
        callback_url: input.callbackUrl,
        return_url: input.returnUrl ?? input.callbackUrl,
        expired_time: Math.floor(Date.now() / 1000) + 3600, // 1 hour
        signature: createHmac("sha256", privateKey)
          .update(`${merchantCode}${input.orderId}${input.amount}`)
          .digest("hex"),
      };
      const res = await fetch(`${base}/transaction/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        cache: "no-store" as RequestCache,
      });
      const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!res.ok || !json) {
        throw new Error(`Tripay create gagal: ${res.status} ${JSON.stringify(json)}`);
      }
      const data = (json.data ?? {}) as Record<string, unknown>;
      const responseMerchantRef =
        typeof data.merchant_ref === "string" ? data.merchant_ref : input.orderId;
      if (responseMerchantRef !== input.orderId) {
        throw new Error("Respons Tripay tidak cocok dengan order server.");
      }
      const baseAmount = data.amount === undefined ? input.amount : Number(data.amount);
      if (!Number.isInteger(baseAmount) || baseAmount !== input.amount) {
        throw new Error("Nominal dasar Tripay tidak cocok dengan order server.");
      }
      // Tripay bisa menambahkan fee customer di atas nominal dasar. Prioritaskan
      // `total_amount` bila ada; selain itu `amount + fee_customer`.
      const feeCustomer = Number(data.fee_customer ?? 0);
      const totalRaw =
        data.total_amount ?? baseAmount + (Number.isFinite(feeCustomer) ? feeCustomer : 0);
      const totalAmount = Number(totalRaw);
      if (!Number.isInteger(totalAmount) || totalAmount < input.amount) {
        throw new Error("Nominal total Tripay tidak valid.");
      }
      return {
        orderId: input.orderId,
        amount: input.amount,
        totalAmount,
        qrString: typeof data.qr_string === "string" ? data.qr_string : null,
        qrImageUrl: typeof data.qr_url === "string" ? data.qr_url : null,
        paymentUrl: typeof data.checkout_url === "string" ? data.checkout_url : null,
        vaNumber: typeof data.pay_code === "string" ? data.pay_code : null,
        expiresAt:
          typeof data.expired_time === "number"
            ? new Date(data.expired_time * 1000).toISOString()
            : null,
        providerRef: String(data.reference ?? ""),
      } satisfies GatewayCreateResult;
    },

    /**
     * Probe auth tanpa membuat transaksi. `getStatus` mengembalikan "pending"
     * untuk body kosong/non-JSON (mis. 401 dari Bearer salah), jadi kredensial
     * salah tampak "sehat". Di sini status HTTP diperiksa eksplisit.
     * Tripay membalas 200 + `success:false` untuk reference tak dikenal; itu
     * berarti auth lolos dan dianggap sukses probe.
     */
    async probeCredential() {
      const res = await fetch(`${base}/transaction/detail?reference=SnapyOS-TESTCONNECT`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        cache: "no-store" as RequestCache,
      });
      if (res.status === 401 || res.status === 403) {
        throw new Error("API key Tripay ditolak provider (401/403)");
      }
      const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!json) throw new Error(`Probe kredensial Tripay gagal (HTTP ${res.status})`);
      // `success:false` karena reference dummy memang tidak ada — auth sudah lolos.
    },

    async getStatus(orderId, amount, providerRef) {
      // Tripay detail butuh `reference` (ref Tripay) atau `merchant_ref` (orderId).
      // Prefer reference (providerRef) bila ada; fallback merchant_ref.
      const query = providerRef
        ? `reference=${encodeURIComponent(providerRef)}`
        : `merchant_ref=${encodeURIComponent(orderId)}`;
      const res = await fetch(`${base}/transaction/detail?${query}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        cache: "no-store" as RequestCache,
      });
      const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!json) return "pending";
      const data = (json.data ?? {}) as Record<string, unknown>;
      const status = mapTripayStatus(String(data.status ?? "UNPAID"));
      // Defense-in-depth: nominal provider harus cocok bila amount diminta.
      // Tripay mengembalikan `amount` (nominal dasar) dan `total_amount`
      // (termasuk fee) — terima bila salah satunya == amount.
      if (status === "paid" && amount !== undefined) {
        const raw = data.amount;
        const totalRaw = data.total_amount;
        const base = typeof raw === "number" ? raw : Number(raw);
        const total = typeof totalRaw === "number" ? totalRaw : Number(totalRaw);
        if (base !== amount && total !== amount) return "pending";
      }
      return status;
    },

    /**
     * Tripay webhook verification.
     * payload = raw body STRING (bukan objek). JSON re-serialize merusak HMAC.
     * signature = header X-Callback-Signature.
     */
    verifyWebhook(payload: unknown, signature: string): boolean {
      if (typeof payload !== "string") return false;
      const expected = computeTripaySignature(payload, privateKey);
      try {
        return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
      } catch {
        return false;
      }
    },
  };
}
