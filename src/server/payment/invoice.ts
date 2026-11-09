import "server-only";

/**
 * Pembayaran invoice subscription via QRIS (Pakasir) — docs/02 §2.5, docs/06 §6.3/§6.7.
 * Owner bayar invoice pending (plan change / add-on) dari halaman Subscription:
 * klik → QR tampil → polling status; webhook tetap source of truth settle.
 * Terpisah dari payments kiosk (checkout_session_id not null) → tabel sendiri.
 * Webhook idempotent: gate transisi status + log event_id unik.
 */

import { randomUUID } from "node:crypto";
import { createServerClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/api-errors";
import { can } from "@/lib/rbac";
import { getMembership } from "@/lib/tenant";
import { computeQrisExpiresAt } from "@/lib/session-timer";
import { paymentWebhookUrl } from "@/lib/payment-credentials";
import { buildOrderId } from "@/lib/qris-helpers";
import type { InvoiceQrisResult } from "@/lib/payment-contracts";
import {
  isInvoiceAmountValid,
  isInvoiceSignatureValid,
  isVerifiedPakasirPayment,
  isWebhookEventFresh,
  mapProviderStatus,
  parseProviderDateTime,
  requiresPakasirServerVerify,
  webhookEventId,
} from "@/server/payment/pakasir-utils";
import { insertAudit } from "@/server/audit";
import {
  applyInvoiceIntent,
  intentToItems,
  recordLatePaymentVoidInvoice,
  type IntentDb,
} from "@/server/subscription";
import { resolveGatewayByCredential } from "@/server/payment/providers/registry";
import { resolveGatewayFromCredential } from "@/server/payment/providers/gateway-factory";
import {
  logPaymentWebhook,
  claimWebhookEvent,
  promoteWebhookEvent,
} from "@/server/payment/webhook-log";
import {
  encodeKioskPaymentPayload,
  decodeKioskPaymentPayload,
  type KioskPaymentPayload,
} from "@/server/payment/kiosk-payment";

type InvoiceRow = {
  id: string;
  business_id: string;
  subscription_id: string | null;
  number: string;
  amount: number;
  status: string;
};

type InvoicePaymentRow = {
  id: string;
  business_id: string;
  invoice_id: string;
  amount: number;
  total_amount: number | null;
  order_id: string;
  payment_reference: string;
  provider_signature: string | null;
  provider: string;
  provider_ref: string | null;
  credential_id: string | null;
  status: string;
  qr_string: string | null;
  expires_at: string | null;
};

async function requireOwner(userId: string, businessId: string) {
  const membership = await getMembership(userId, businessId);
  if (!membership) throw new ApiError("NOT_FOUND", "Business tidak ditemukan");
  if (!can(membership.role, "subscription:write")) {
    throw new ApiError("FORBIDDEN", "Hanya owner yang dapat membayar invoice");
  }
  return membership;
}

async function loadInvoice(businessId: string, invoiceId: string): Promise<InvoiceRow> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("invoices")
    .select("id, business_id, subscription_id, number, amount, status")
    .eq("id", invoiceId)
    .eq("business_id", businessId)
    .maybeSingle();
  const row = (data ?? null) as unknown as InvoiceRow | null;
  if (!row) throw new ApiError("PAYMENT_NOT_FOUND", "Invoice tidak ditemukan");
  return row;
}

/**
 * Gateway untuk baris invoice_payments.
 *
 * Invoice langganan adalah tagihan PLATFORM: `credential_id` null berarti
 * charge dibuat di akun aggregator platform. Jangan pernah fallback ke
 * credential tenant — kalau fallback, tenant bisa menyelesaikan tagihannya
 * sendiri di akun merchant-nya dan platform tidak menerima dana.
 */
async function resolvePaymentGateway(payment: {
  provider: string;
  credential_id: string | null;
}) {
  if (!payment.credential_id) {
    const aggregator = resolveGatewayFromCredential(null);
    if (aggregator.provider !== payment.provider) {
      throw new ApiError("INTERNAL", "Provider pembayaran invoice tidak cocok");
    }
    return aggregator;
  }
  const byCredential = await resolveGatewayByCredential(payment.credential_id);
  if (!byCredential || byCredential.provider !== payment.provider) {
    // Credential hilang/berputar/berbeda provider → fail closed. Status tidak
    // bisa diverifikasi, jadi jangan settle.
    throw new ApiError("INTERNAL", "Kredensial pembayaran invoice tidak tersedia");
  }
  return byCredential;
}

async function loadLatestInvoicePayment(invoiceId: string): Promise<InvoicePaymentRow | null> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("invoice_payments")
    .select("*")
    .eq("invoice_id", invoiceId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data ?? null) as unknown as InvoicePaymentRow | null;
}

export type InvoiceDetail = {
  id: string;
  number: string;
  amount: number;
  status: string;
  paidAt: string | null;
  createdAt: string;
  intent: { type?: string; code?: string; name?: string } | null;
  promo: { code: string; discount: number } | null;
  items: { type: string; name: string; qty: number; amount: number }[];
  businessName: string;
  canWrite: boolean;
};

/** Detail invoice untuk halaman pembayaran — member business pemilik invoice. */
export async function getInvoiceDetail(
  userId: string,
  invoiceId: string
): Promise<InvoiceDetail | null> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("invoices")
    .select(
      "id, business_id, number, amount, status, paid_at, created_at, intent, businesses ( name )"
    )
    .eq("id", invoiceId)
    .maybeSingle();
  const row = (data ?? null) as {
    id: string;
    business_id: string;
    number: string;
    amount: number;
    status: string;
    paid_at: string | null;
    created_at: string;
    intent: {
      type?: string;
      code?: string;
      name?: string;
      items?: unknown;
      promo?: { code: string; discount: number };
    } | null;
    businesses: { name: string } | { name: string }[] | null;
  } | null;
  if (!row) return null;
  const membership = await getMembership(userId, row.business_id);
  if (!membership) return null;
  // Invoice/langganan = owner-only (docs/09 §9.2), konsisten dengan
  // getSubscriptionOverview. Manager/staff → tidak ditemukan (bukan 403).
  if (!can(membership.role, "subscription:write")) return null;

  return {
    id: row.id,
    number: row.number,
    amount: row.amount,
    status: row.status,
    paidAt: row.paid_at,
    createdAt: row.created_at,
    intent: row.intent,
    promo: row.intent?.promo ?? null,
    items: intentToItems(row.intent as Parameters<typeof intentToItems>[0], row.amount).map(
      (i) => ({
        type: i.type,
        name: i.name ?? i.code ?? i.type,
        qty: i.qty,
        amount: i.amount,
      })
    ),
    businessName:
      row.businesses && !Array.isArray(row.businesses) ? row.businesses.name : "SnapyOS",
    canWrite: can(membership.role, "subscription:write"),
  };
}

/** Bukti pembayaran (receipt) — hanya invoice paid. */
export async function getInvoiceReceipt(userId: string, invoiceId: string) {
  const invoice = await getInvoiceDetail(userId, invoiceId);
  if (!invoice || invoice.status !== "paid") return null;
  const payment = await loadLatestInvoicePayment(invoiceId);
  return {
    invoice,
    orderId: payment?.order_id ?? null,
    paymentReference: payment?.payment_reference ?? null,
    provider: payment?.provider ?? null,
  };
}

/** Invoice pending → paid; late payment invoice void TIDAK auto-reactivate. */
async function markInvoicePaid(payment: InvoicePaymentRow) {
  const supabase = createServerClient();
  const { data: currentData } = await supabase
    .from("invoices")
    .select("status, number, subscription_id, amount, intent")
    .eq("id", payment.invoice_id)
    .maybeSingle();
  const current = (currentData ?? null) as {
    status: string;
    number: string | null;
    subscription_id: string | null;
    amount: number | null;
    intent: Parameters<typeof intentToItems>[0];
  } | null;
  if (current?.status === "paid") {
    await applyInvoiceIntent(payment.business_id, payment.invoice_id);
    return;
  }
  if (current?.status === "void") {
    // Late payment pada invoice void (P0): uang settled untuk tagihan yang
    // sudah dibatalkan. Invoice TETAP void (uang wajib direview/direfund
    // manusia) — catat audit + tiket review agar tidak hilang diam-diam.
    // Webhook tetap dianggap sukses (baris invoice_payments sudah paid).
    await recordLatePaymentVoidInvoice(
      {
        db: createServerClient() as unknown as IntentDb,
        audit: (input) => insertAudit(input),
      },
      {
        businessId: payment.business_id,
        invoiceId: payment.invoice_id,
        subscriptionId: current.subscription_id,
        amount: payment.amount ?? current.amount ?? 0,
        number: current.number,
        intent: current.intent,
      }
    );
    return;
  }
  if (current?.status !== "pending") return;

  const { data: paid } = await supabase
    .from("invoices")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", payment.invoice_id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (!paid) return;
  await insertAudit({
    actorId: null,
    businessId: payment.business_id,
    action: "invoice.paid",
    target: payment.invoice_id,
    meta: { order_id: payment.order_id, amount: payment.amount },
  });
  await applyInvoiceIntent(payment.business_id, payment.invoice_id);
}

/**
 * Buat QRIS untuk invoice pending. Reuse QR pending yang belum expired;
 * QR baru menghanguskan QR pending lama (anti double QR per invoice).
 */
export async function createInvoiceQris(
  userId: string,
  businessId: string,
  invoiceId: string
): Promise<InvoiceQrisResult> {
  await requireOwner(userId, businessId);
  const invoice = await loadInvoice(businessId, invoiceId);
  if (invoice.status === "paid") {
    throw new ApiError("PAYMENT_ALREADY_PROCESSED", "Invoice sudah dibayar");
  }
  if (invoice.status !== "pending") {
    throw new ApiError("PAYMENT_EXPIRED", "Invoice sudah dibatalkan");
  }
  if (invoice.amount === 0) {
    const supabase = createServerClient();
    const paidAt = new Date().toISOString();
    const { data: paid } = await supabase
      .from("invoices")
      .update({ status: "paid", paid_at: paidAt })
      .eq("id", invoice.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (paid) {
      await insertAudit({
        actorId: null,
        businessId,
        action: "invoice.paid",
        target: invoice.id,
        meta: { amount: 0, checkout_free: true },
      });
      // Plan/add-on tetap diaktifkan (payment-first) walau nominal 0. Jangan
      // lempar error ke client walau applyInvoiceIntent gagal (INTENT_EXCEPTION)
      // — invoice sudah paid; intent di-apply ulang via polling (idempotent).
      try {
        await applyInvoiceIntent(businessId, invoice.id);
      } catch {
        // Recovery via getInvoicePaymentStatus (polling) akan apply ulang.
      }
    }
    return {
      status: "paid",
      qr_image: null,
      qr_url: null,
      amount: 0,
      total_amount: 0,
      expires_at: null,
      invoice_number: invoice.number,
      payment_url: null,
      va_number: null,
    };
  }

  const supabase = createServerClient();

  await supabase
    .from("invoice_payments")
    .update({ status: "expired" })
    .eq("invoice_id", invoice.id)
    .eq("status", "creating")
    .lt("created_at", new Date(Date.now() - 2 * 60_000).toISOString());

  // Reuse QR hidup (reload halaman tidak membuat tagihan baru).
  const existing = await loadLatestInvoicePayment(invoice.id);
  if (existing?.status === "creating") {
    throw new ApiError("VALIDATION_ERROR", "QRIS sedang dibuat. Tunggu sebentar.");
  }
  if (
    existing &&
    existing.status === "pending" &&
    existing.expires_at &&
    Date.now() < new Date(existing.expires_at).getTime()
  ) {
    return invoicePaymentResult(invoice, existing);
  }

  await supabase
    .from("invoice_payments")
    .update({ status: "expired" })
    .eq("invoice_id", invoice.id)
    .eq("status", "pending");

  // Invoice langganan = tagihan PLATFORM. Selalu pakai aggregator platform
  // (env PAKASIR_*), bukan credential merchant tenant: kalau memakai credential
  // tenant, pembayaran masuk ke akun tenant dan tenant sendiri yang memegang
  // kunci verifikasi status.
  const gateway = resolveGatewayFromCredential(null);

  // Validate callback URL BEFORE reserving a row — direct merchant tanpa
  // callback terkonfigurasi aman harus gagal tanpa meninggalkan reservasi
  // `creating` yang memblokir invoice (partial unique index) sampai stale.
  const callbackUrl =
    gateway.provider === "pakasir" ? "" : (paymentWebhookUrl(gateway.provider) ?? "");
  if (gateway.provider !== "pakasir" && !callbackUrl) {
    throw new ApiError("INTERNAL", "URL callback gateway belum dikonfigurasi aman");
  }

  const paymentReference = randomUUID().replace(/-/g, "").slice(0, 12);
  const orderId = buildOrderId(paymentReference);
  const { data: reservation, error: reserveError } = await supabase
    .from("invoice_payments")
    .insert({
      business_id: businessId,
      invoice_id: invoice.id,
      amount: invoice.amount,
      order_id: orderId,
      payment_reference: paymentReference,
      provider: gateway.provider,
      credential_id: null,
      status: "creating",
    })
    .select("id")
    .single();
  if (reserveError || !reservation) {
    if (reserveError?.code === "23505") {
      throw new ApiError("VALIDATION_ERROR", "QRIS sedang dibuat. Tunggu sebentar.");
    }
    throw new ApiError("INTERNAL", "Gagal menyiapkan QRIS invoice");
  }

  try {
    const created = await gateway.createTransaction({
      orderId,
      amount: invoice.amount,
      description: `Invoice ${invoice.number}: SnapyOS`,
      callbackUrl,
      returnUrl: callbackUrl || undefined,
    });
    if (
      created.orderId !== orderId ||
      created.amount !== invoice.amount ||
      !Number.isInteger(created.totalAmount) ||
      created.totalAmount < created.amount
    ) {
      throw new ApiError("INTERNAL", "Respons gateway pembayaran tidak valid");
    }
    // Semua gateway menyediakan salah satu dari: QR payload, QR URL, redirect
    // URL, atau VA. Tolak bila semuanya kosong (client tidak bisa menampilkan).
    if (!created.qrString && !created.qrImageUrl && !created.paymentUrl && !created.vaNumber) {
      throw new ApiError(
        "INTERNAL",
        "Gateway tidak mengirim payload pembayaran (QR/redirect/VA semuanya kosong)."
      );
    }
    const expiresAt = computeQrisExpiresAt(30, parseProviderDateTime(created.expiresAt));
    if (Date.parse(expiresAt) <= Date.now()) {
      throw new ApiError("INTERNAL", "Gateway mengirim pembayaran yang sudah kedaluwarsa");
    }
    const display: KioskPaymentPayload["display"] = created.paymentUrl
      ? "redirect"
      : created.vaNumber
        ? "va"
        : "qris";
    const payload: KioskPaymentPayload = {
      display,
      method: created.vaNumber ? "va" : created.paymentUrl ? "redirect" : "qris",
      qrString: created.qrString,
      qrImageUrl: created.qrImageUrl,
      paymentUrl: created.paymentUrl,
      vaNumber: created.vaNumber,
    };
    const { data: inserted, error } = await supabase
      .from("invoice_payments")
      .update({
        total_amount: created.totalAmount,
        provider_ref: created.providerRef || null,
        status: "pending",
        qr_string: encodeKioskPaymentPayload(payload),
        expires_at: expiresAt,
      })
      .eq("id", reservation.id)
      .eq("status", "creating")
      .select("id")
      .single();
    if (error || !inserted) throw new ApiError("INTERNAL", "Gagal menyimpan pembayaran invoice");
    return {
      status: "pending",
      qr_image: payload.qrString && !payload.qrString.startsWith("http") ? payload.qrString : null,
      qr_url: payload.qrImageUrl?.startsWith("http") ? payload.qrImageUrl : null,
      amount: created.amount,
      total_amount: created.totalAmount,
      expires_at: expiresAt,
      invoice_number: invoice.number,
      payment_url: payload.paymentUrl,
      va_number: payload.vaNumber,
    };
  } catch (error) {
    await supabase
      .from("invoice_payments")
      .update({ status: "expired" })
      .eq("id", reservation.id)
      .eq("status", "creating");
    throw error;
  }
}

/** Serialize invoice payment row → client DTO (QR/redirect/VA). */
function invoicePaymentResult(
  invoice: { number: string },
  payment: InvoicePaymentRow
): InvoiceQrisResult {
  const payload = decodeKioskPaymentPayload(payment.qr_string);
  if (!payload) {
    // Legacy row (payload QR mentah, dibuat sebelum 0047): render sebagai QR.
    const raw = payment.qr_string ?? null;
    const isUrl = raw?.startsWith("http") ?? false;
    return {
      status: "pending",
      qr_image: raw && !isUrl ? raw : null,
      qr_url: raw && isUrl ? raw : null,
      amount: payment.amount,
      total_amount: payment.total_amount ?? payment.amount,
      expires_at: payment.expires_at,
      invoice_number: invoice.number,
      payment_url: raw && isUrl ? raw : null,
      va_number: null,
    };
  }
  return {
    status: "pending",
    qr_image: payload.qrString && !payload.qrString.startsWith("http") ? payload.qrString : null,
    qr_url: payload.qrImageUrl?.startsWith("http") ? payload.qrImageUrl : null,
    amount: payment.amount,
    total_amount: payment.total_amount ?? payment.amount,
    expires_at: payment.expires_at,
    invoice_number: invoice.number,
    payment_url: payload.paymentUrl,
    va_number: payload.vaNumber,
  };
}

/** Polling status pembayaran invoice (recover webhook delayed). */
export async function getInvoicePaymentStatus(
  userId: string,
  businessId: string,
  invoiceId: string
): Promise<{ status: "pending" | "paid" | "expired" | "none" }> {
  const membership = await getMembership(userId, businessId);
  if (!membership) throw new ApiError("NOT_FOUND", "Business tidak ditemukan");

  const invoice = await loadInvoice(businessId, invoiceId);
  if (invoice.status === "paid") {
    // Recovery: intent bisa belum sempat diterapkan saat paid (crash/retry) —
    // applyInvoiceIntent idempotent, aman dipanggil ulang di sini.
    try {
      await applyInvoiceIntent(businessId, invoice.id);
    } catch {
      // Status tetap dilaporkan; intent dicoba lagi pada polling berikutnya.
    }
    return { status: "paid" };
  }

  const payment = await loadLatestInvoicePayment(invoiceId);
  if (!payment) return { status: "none" };

  // Crash-window recovery: payment sudah paid (webhook settle) tapi invoice
  // masih pending / intent belum diterapkan. markInvoicePaid flip invoice +
  // apply intent (idempotent penuh) — tanpa ini invoice macet selamanya.
  if (payment.status === "paid") {
    try {
      await markInvoicePaid(payment);
    } catch {
      // Retry polling berikutnya.
    }
    return { status: "paid" };
  }

  const supabase = createServerClient();
  if (payment.status === "pending" || payment.status === "expired") {
    try {
      const gateway = await resolvePaymentGateway(payment);
      const providerStatus = await gateway.getStatus(
        payment.order_id,
        payment.amount,
        payment.provider_ref
      );
      if (providerStatus === "paid") {
        const { data } = await supabase
          .from("invoice_payments")
          .update({ status: "paid", paid_at: new Date().toISOString() })
          .eq("id", payment.id)
          .in("status", ["pending", "expired"])
          .select("id")
          .maybeSingle();
        if (data) {
          await markInvoicePaid(payment);
          return { status: "paid" };
        }
      } else if (payment.status === "pending" && providerStatus === "expired") {
        await supabase
          .from("invoice_payments")
          .update({ status: "expired" })
          .eq("id", payment.id)
          .eq("status", "pending");
        return { status: "expired" };
      }
    } catch {
      // Provider unreachable → status DB tetap dipakai.
    }
  }

  if (payment.status === "pending" && payment.expires_at) {
    if (Date.now() >= new Date(payment.expires_at).getTime()) {
      await supabase
        .from("invoice_payments")
        .update({ status: "expired" })
        .eq("id", payment.id)
        .eq("status", "pending");
      return { status: "expired" };
    }
  }

  return { status: payment.status === "paid" ? "paid" : "pending" };
}

/**
 * Minimum Pakasir webhook fields needed for invoice payment matching.
 */
export type InvoiceWebhookInput = {
  order_id: string;
  status: string;
  amount?: number | null;
  total_amount?: number | null;
  payment_date?: string | null;
  signature?: string | null;
};

type InvoiceWebhookResult = {
  ok: boolean;
  reason:
    | "invalid_signature"
    | "amount_mismatch"
    | "unverified_status"
    | "stale"
    | "already_paid"
    | "duplicate_event"
    | "paid"
    | "expired"
    | "no_transition";
  retryable?: boolean;
} | null;

/**
 * Branch webhook untuk pembayaran invoice — dipanggil dari
 * handlePakasirWebhook saat order_id tidak ada
 * di `payments`. Return null bila order_id bukan invoice payment
 * (pemanggil melanjutkan).
 */

export async function handleInvoiceWebhookEvent(
  event: InvoiceWebhookInput,
  rawPayload: unknown
): Promise<InvoiceWebhookResult> {
  const supabase = createServerClient();
  const { data: row } = await supabase
    .from("invoice_payments")
    .select("*")
    .eq("order_id", event.order_id)
    .maybeSingle();
  const payment = (row ?? null) as unknown as InvoicePaymentRow | null;
  if (!payment) return null;

  const eventId = webhookEventId(event.order_id, event.status, event.payment_date);
  // C2 (security): JANGAN short-circuit saat provider_signature null.
  const signatureValid = isInvoiceSignatureValid(payment.provider_signature, event.signature);
  const amountValid = isInvoiceAmountValid(event, payment);

  // H2 — freshness: tolak webhook di luar jendela (replay/clock skew).
  if (!isWebhookEventFresh(event.payment_date, new Date(), parseProviderDateTime)) {
    await logPaymentWebhook({
      provider: payment.provider,
      eventId: `${eventId}:stale`,
      eventType: event.status,
      payload: rawPayload,
      signatureValid,
      status: "error",
      paymentId: null,
      error: "Webhook di luar jendela freshness",
    });
    return { ok: false, reason: "stale" };
  }

  if (!amountValid) {
    await logPaymentWebhook({
      provider: payment.provider,
      eventId,
      eventType: event.status,
      payload: rawPayload,
      signatureValid,
      status: "error",
      paymentId: null,
      error: "total_amount tidak cocok",
    });
    return { ok: false, reason: "amount_mismatch" };
  }

  if (payment.status === "paid") {
    await logPaymentWebhook({
      provider: payment.provider,
      eventId,
      eventType: event.status,
      payload: rawPayload,
      signatureValid: true,
      status: "ignored",
      paymentId: null,
      error: "Sudah paid (duplicate webhook)",
    });
    // Recovery: pastikan intent (plan/add-on) benar-benar diterapkan. Panggil
    // markInvoicePaid (bukan applyInvoiceIntent) karena crash-window bisa
    // menyisakan payment=paid + invoice=pending — applyInvoiceIntent no-op
    // pada invoice pending, sedangkan markInvoicePaid flip invoice lalu apply
    // intent (idempotent penuh).
    try {
      await markInvoicePaid(payment);
    } catch {
      // Retry webhook berikutnya akan mencoba lagi.
    }
    return { ok: true, reason: "already_paid" };
  }

  const mapped = mapProviderStatus(event.status);
  if (mapped === "paid") {
    if (!requiresPakasirServerVerify(payment.provider, signatureValid)) {
      // Provider non-Pakasir TANPA signature tepercaya → tidak ada jalur
      // verifikasi lain → tolak (fail-closed).
      await logPaymentWebhook({
        provider: payment.provider,
        eventId,
        eventType: event.status,
        payload: rawPayload,
        signatureValid: false,
        status: "error",
        paymentId: null,
        error: "Signature tidak cocok & provider tanpa verifikasi server-to-server",
      });
      return { ok: false, reason: "invalid_signature" };
    }
    // C2 + AGENTS.md: SEMUA invoice Pakasir wajib lulus server-to-server
    // re-verify sebelum transitionToPaid — bukan hanya saat signature null.
    // Webhook bukan bukti pembayaran. Signature tepercaya (legacy) pun tetap
    // di-re-verify bila provider = pakasir.
    const gateway = await resolvePaymentGateway(payment);
    // M3: getStatus bisa throw (outage) → jangan 500 generik; kembalikan
    // unverified_status retryable agar route membalas non-2xx (provider retry).
    let providerStatus: string;
    try {
      providerStatus = await gateway.getStatus(
        payment.order_id,
        payment.amount,
        payment.provider_ref
      );
    } catch (error) {
      await logPaymentWebhook({
        provider: payment.provider,
        eventId: `${eventId}:unverified_error`,
        eventType: event.status,
        payload: rawPayload,
        signatureValid: false,
        status: "error",
        paymentId: null,
        error: `Verifikasi status provider error: ${error instanceof Error ? error.message : String(error)}`,
      });
      return { ok: false, reason: "unverified_status", retryable: true };
    }
    if (!isVerifiedPakasirPayment(event.status, providerStatus)) {
      await logPaymentWebhook({
        provider: payment.provider,
        eventId: `${eventId}:unverified`,
        eventType: event.status,
        payload: rawPayload,
        signatureValid: false,
        status: "error",
        paymentId: null,
        error: "Status paid invoice tidak terverifikasi di Pakasir",
      });
      return { ok: false, reason: "unverified_status" };
    }
  }

  // H3 — klaim `received` sebelum settle; promote `processed` setelah sukses.
  // Redelivery event yang sebelumnya gagal (`received`/`error`) tidak diblokir;
  // baris `processed`/`ignored` memblokir (anti double-settle). Menutup celah
  // crash-window: persist terminal TIDAK lagi mendahului transisi settlement.
  const claimed = await claimWebhookEvent({
    provider: payment.provider,
    eventId,
    eventType: event.status,
    payload: rawPayload,
    signatureValid: true,
    paymentId: null,
  });
  if (claimed === "duplicate") return { ok: true, reason: "duplicate_event" };

  if (mapped === "paid") {
    const { data } = await supabase
      .from("invoice_payments")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", payment.id)
      .in("status", ["pending", "expired"])
      .select("id")
      .maybeSingle();
    if (data) {
      await markInvoicePaid(payment);
      await promoteWebhookEvent({ eventId, status: "processed", paymentId: null });
      return { ok: true, reason: "paid" };
    }
    return { ok: true, reason: "no_transition" };
  }
  if (mapped === "expired") {
    await supabase
      .from("invoice_payments")
      .update({ status: "expired" })
      .eq("id", payment.id)
      .eq("status", "pending");
    await promoteWebhookEvent({ eventId, status: "processed", paymentId: null });
    return { ok: true, reason: "expired" };
  }
  return { ok: true, reason: "no_transition" };
}

/**
 * Branch webhook direct merchant (Midtrans/Tripay) untuk invoice subscription.
 * Verify signature via credential adapter, lalu settle — dipanggil dari
 * webhook-handler saat order_id bukan payment kiosk.
 */
export async function handleDirectInvoiceWebhook(
  provider: "midtrans" | "tripay",
  orderId: string,
  signaturePayload: unknown,
  signature: string,
  eventId: string,
  eventType: string,
  paid: boolean,
  expired: boolean,
  amount: number | null,
  rawPayload: unknown
): Promise<InvoiceWebhookResult> {
  const supabase = createServerClient();
  const { data: row } = await supabase
    .from("invoice_payments")
    .select("*")
    .eq("order_id", orderId)
    .maybeSingle();
  const payment = (row ?? null) as unknown as InvoicePaymentRow | null;
  if (!payment) return null;

  const gateway = await resolvePaymentGateway(payment);
  if (gateway.provider !== provider) {
    await logPaymentWebhook({
      provider: payment.provider,
      eventId,
      eventType,
      payload: rawPayload,
      signatureValid: false,
      status: "error",
      paymentId: null,
      error: "provider credential tidak cocok",
    });
    return { ok: false, reason: "invalid_signature" };
  }
  if (!gateway.verifyWebhook(signaturePayload, signature)) {
    await logPaymentWebhook({
      provider: payment.provider,
      eventId,
      eventType,
      payload: rawPayload,
      signatureValid: false,
      status: "error",
      paymentId: null,
      error: "signature tidak valid",
    });
    return { ok: false, reason: "invalid_signature" };
  }
  // Nominal callback direct (Midtrans/Tripay) bisa memuat admin fee provider:
  // terima amount == amount (nominal dasar) ATAU == total_amount (bila tercatat).
  // Aturan sama dengan jalur kiosk (src/lib/direct-webhook.ts): fail-closed,
  // tanpa rentang/ambang, amount null tetap ditolak.
  if (
    amount === null ||
    (amount !== payment.amount && amount !== (payment.total_amount ?? payment.amount))
  ) {
    await logPaymentWebhook({
      provider: payment.provider,
      eventId,
      eventType,
      payload: rawPayload,
      signatureValid: true,
      status: "error",
      paymentId: null,
      error: "amount tidak cocok",
    });
    return { ok: false, reason: "amount_mismatch" };
  }

  if (payment.status === "paid") {
    await logPaymentWebhook({
      provider: payment.provider,
      eventId,
      eventType,
      payload: rawPayload,
      signatureValid: true,
      status: "ignored",
      paymentId: null,
      error: "Sudah paid (duplicate webhook)",
    });
    try {
      await markInvoicePaid(payment);
    } catch {
      // Retry webhook berikutnya.
    }
    return { ok: true, reason: "already_paid" };
  }

  // Anti-replay: verifikasi server-to-server sebelum settle. Signature webhook
  // saja tidak cukup — webhook asli yang di-replay (atau key bocor/rotasi) tidak
  // boleh mengaktifkan subscription tanpa konfirmasi status independen.
  if (paid) {
    // M3: getStatus bisa throw (outage) → unverified_status retryable, bukan 500 generik.
    let providerStatus: string;
    try {
      providerStatus = await gateway.getStatus(
        payment.order_id,
        payment.amount,
        payment.provider_ref
      );
    } catch (error) {
      await logPaymentWebhook({
        provider: payment.provider,
        eventId: `${eventId}:unverified_error`,
        eventType,
        payload: rawPayload,
        signatureValid: false,
        status: "error",
        paymentId: null,
        error: `Verifikasi status provider error: ${error instanceof Error ? error.message : String(error)}`,
      });
      return { ok: false, reason: "unverified_status", retryable: true };
    }
    if (providerStatus !== "paid") {
      await logPaymentWebhook({
        provider: payment.provider,
        eventId: `${eventId}:unverified`,
        eventType,
        payload: rawPayload,
        signatureValid: false,
        status: "error",
        paymentId: null,
        error: `Status paid invoice tidak terverifikasi di ${payment.provider}`,
      });
      return { ok: false, reason: "unverified_status" };
    }
  }

  // H3 — klaim `received` sebelum settle; promote setelah sukses. Redelivery
  // event_id yang sebelumnya gagal (`received`/`error`) tidak diblokir.
  const claimed = await claimWebhookEvent({
    provider: payment.provider,
    eventId,
    eventType,
    payload: rawPayload,
    signatureValid: true,
    paymentId: null,
  });
  if (claimed === "duplicate") return { ok: true, reason: "duplicate_event" };

  if (paid) {
    const { data } = await supabase
      .from("invoice_payments")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", payment.id)
      .in("status", ["pending", "expired"])
      .select("id")
      .maybeSingle();
    if (data) {
      await promoteWebhookEvent({ eventId, status: "processed", paymentId: null });
      await markInvoicePaid(payment);
      return { ok: true, reason: "paid" };
    }
    return { ok: true, reason: "no_transition" };
  }
  if (expired) {
    await supabase
      .from("invoice_payments")
      .update({ status: "expired" })
      .eq("id", payment.id)
      .eq("status", "pending");
    await promoteWebhookEvent({ eventId, status: "processed", paymentId: null });
    return { ok: true, reason: "expired" };
  }
  return { ok: true, reason: "no_transition" };
}
