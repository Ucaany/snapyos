/**
 * Pakasir adapter (PaymentGateway) — Phase 1 refactor.
 * Delegates ke helper existing: src/server/payment/pakasir-utils.ts + src/lib/qris-helpers.ts.
 * Sumber kredensial: credential DB bila ada, fallback env var (aggregator).
 *
 * verifyWebhook: Pakasir TIDAK kirim signature di webhook. Verifikasi dilakukan
 * via server-to-server GET /transactiondetail (pola existing di webhook-handler.ts).
 * Implementasi verifyWebhook = return true HANYA karena dipanggil SETELAH
 * verifikasi status via getStatus. Ini konsisten dengan pola existing.
 *
 * NO "server-only" — pure, testable.
 */

import {
  normalizeCreateResult as normalizePakasirCreate,
  mapProviderStatus as pakasirMapStatus,
  parseProviderDateTime,
} from "../pakasir-utils.ts";
import { buildOrderId } from "../../../lib/qris-helpers.ts";
import type {
  PaymentGateway,
  GatewayCreateResult,
  GatewayStatus,
  GatewayCredential,
} from "./types";

const DEFAULT_BASE = "https://app.pakasir.com";

/**
 * Ekstrak nominal dari respons status/transactiondetail Pakasir. Menerima
 * `total_payment` (nominal yang benar-benar dibayar, termasuk kode unik) bila
 * ada, fallback ke `amount`. Return null bila tak ada nominal valid — caller
 * memperlakukan null sebagai tidak cocok (fail-closed).
 */
function pakasirProviderAmount(transaction: Record<string, unknown> | null): number | null {
  if (!transaction) return null;
  const candidate = transaction.total_payment ?? transaction.amount;
  const value = typeof candidate === "number" ? candidate : Number(candidate);
  return Number.isInteger(value) ? value : null;
}

function resolveConfig(credential: GatewayCredential | null): {
  apiKey: string;
  project: string;
  baseUrl: string;
} {
  if (credential) {
    return {
      apiKey: credential.serverKey,
      project: credential.merchantId,
      baseUrl: (typeof credential.metadata.base_url === "string"
        ? credential.metadata.base_url
        : DEFAULT_BASE
      ).replace(/\/$/, ""),
    };
  }
  const apiKey = process.env.PAKASIR_API_KEY?.trim() ?? "";
  const project = process.env.PAKASIR_PROJECT_SLUG?.trim() ?? "";
  if (!apiKey || !project) {
    throw new Error(
      "Payment belum terkonfigurasi. Isi PAKASIR_API_KEY dan PAKASIR_PROJECT_SLUG."
    );
  }
  return {
    apiKey,
    project,
    baseUrl: (process.env.PAKASIR_BASE_URL?.trim() || DEFAULT_BASE).replace(/\/$/, ""),
  };
}

async function pakasirRequest(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, cache: "no-store" as RequestCache });
  const json = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  return { ok: response.ok, json };
}

export function createPakasirGateway(credential: GatewayCredential | null): PaymentGateway {
  return {
    provider: "pakasir",

    async createTransaction(input) {
      if (!Number.isInteger(input.amount) || input.amount <= 0) {
        throw new Error("Amount harus integer IDR positif");
      }
      const { apiKey, project, baseUrl } = resolveConfig(credential);
      // buildOrderId is the canonical SnapyOS order-ID format. Do not rewrite an
      // already-server-created order ID; gateway and payment row must match exactly.
      if (buildOrderId(input.orderId.replace(/^SnapyOS-/, "")) !== input.orderId) {
        throw new Error("Order ID Pakasir harus menggunakan format SnapyOS-.");
      }
      // API v2: POST /api/v2/create-transaction/{slug}/{order_id}, header X-Api-Key.
      const { ok, json } = await pakasirRequest(
        `${baseUrl}/api/v2/create-transaction/${encodeURIComponent(project)}/${encodeURIComponent(input.orderId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
          body: JSON.stringify({ method: "qris", amount: input.amount }),
        }
      );
      const result = normalizePakasirCreate(json);
      if (!ok || !result || result.order_id !== input.orderId || result.amount !== input.amount) {
        throw new Error("Gagal membuat QRIS Pakasir. Coba lagi.");
      }
      return {
        orderId: result.order_id,
        amount: result.amount,
        totalAmount: result.total_amount,
        qrString: result.qr_string,
        qrImageUrl: null,
        paymentUrl: null,
        vaNumber: null,
        expiresAt: parseProviderDateTime(result.expired_at) ?? result.expired_at,
        providerRef: result.txn_id,
      } satisfies GatewayCreateResult;
    },

    async getStatus(orderId, amount, providerRef) {
      if (amount !== undefined && (!Number.isInteger(amount) || amount < 0)) {
        throw new Error("Nominal payment Pakasir tidak valid.");
      }
      const { apiKey, project, baseUrl } = resolveConfig(credential);
      // v2 status endpoint menerima txn_id. Fallback ke orderId bila txn_id
      // belum tersimpan (legacy payment in-flight yang dibuat sebelum migrasi).
      const txnId = providerRef || orderId;
      const { ok, json } = await pakasirRequest(
        `${baseUrl}/api/v2/transaction-status/${encodeURIComponent(project)}/${encodeURIComponent(txnId)}`,
        { headers: { "X-Api-Key": apiKey } }
      );
      if (!ok) return "pending";
      const transaction = (json ?? null) as Record<string, unknown> | null;
      const status = (pakasirMapStatus(transaction?.status) as GatewayStatus) ?? "pending";
      // Verifikasi amount server-to-server (defense-in-depth): status "paid" HANYA
      // dipercaya bila nominal yang dikembalikan provider cocok dengan amount yang
      // diminta. Endpoint status Pakasir mengembalikan `amount`/`total_payment`;
      // tolak (downgrade ke "pending") bila tak ada nominal atau tidak cocok —
      // mencegah settle bila txn_id/order tertukar atau nominal berbeda.
      if (status === "paid" && amount !== undefined) {
        const providerAmount = pakasirProviderAmount(transaction);
        if (providerAmount === null || providerAmount !== amount) return "pending";
      }
      return status;
    },

    /**
     * Pakasir TIDAK kirim signature di webhook. Verifikasi dilakukan via
     * server-to-server GET /transactiondetail (webhook-handler.ts existing).
     * Return true karena ini dipanggil SETELAH getStatus memverifikasi pembayaran.
     */
    verifyWebhook(): boolean {
      return true;
    },
  };
}
