/**
 * Payment webhook handlers — docs/06 §6.7 (signature + idempotency + audit log).
 */

import "server-only";
import { processDirectWebhook, type DirectWebhookDependencies } from "@/lib/direct-webhook";
import {
  invalidWebhookEventId,
  midtransEventId,
  midtransWebhookSchema,
  parseMidtransAmount,
} from "@/server/payment/midtrans-utils";
import {
  tripayEventId,
  tripayWebhookSchema,
  tripayWebhookAmount,
} from "@/server/payment/tripay-utils";
import { createServerClient } from "@/lib/supabase/server";
import { isMidtransFraudAccepted } from "@/server/payment/providers/midtrans";
import { resolveGatewayByCredential } from "@/server/payment/providers/registry";
import { handleDirectInvoiceWebhook } from "@/server/payment/invoice";
import {
  logPaymentWebhook,
  claimWebhookEvent,
  promoteWebhookEvent,
} from "@/server/payment/webhook-log";
import type { PaymentRow } from "./checkout-shared";
import { loadCheckout } from "./checkout-shared";
import {
  transitionPaymentToPaid,
  transitionPaymentToExpired,
  runPaidSideEffects,
} from "./settlement";

function directWebhookDependencies(): DirectWebhookDependencies {
  return {
    async findPayment(orderId) {
      const { data } = await createServerClient()
        .from("payments")
        .select("*")
        .eq("order_id", orderId)
        .maybeSingle();
      return (data ?? null) as unknown as PaymentRow | null;
    },
    resolveGateway: resolveGatewayByCredential,
    async persist(log) {
      return logPaymentWebhook({
        provider: log.provider,
        eventId: log.eventId,
        eventType: log.eventType,
        payload: log.payload,
        signatureValid: log.signatureValid,
        status: log.status,
        paymentId: log.paymentId,
        ...(log.error ? { error: log.error } : {}),
      });
    },
    async claimEvent(log) {
      return claimWebhookEvent({
        provider: log.provider,
        eventId: log.eventId,
        eventType: log.eventType,
        payload: log.payload,
        signatureValid: log.signatureValid,
        paymentId: log.paymentId,
      });
    },
    async promoteEvent(eventId, status, error) {
      await promoteWebhookEvent({
        eventId,
        status,
        paymentId: null,
        ...(error ? { error } : {}),
      });
    },
    transitionToPaid: (paymentId) =>
      transitionPaymentToPaid(paymentId, ["creating", "pending", "expired"]),
    transitionToExpired: (paymentId) => transitionPaymentToExpired(paymentId),
    loadCheckout,
    runPaidSideEffects: (payment, checkout) =>
      runPaidSideEffects(
        payment as PaymentRow,
        checkout as Awaited<ReturnType<typeof loadCheckout>>
      ),
    // Defense-in-depth: re-fetch status langsung dari provider sebelum settle
    // (Midtrans/Tripay). Amount diverifikasi oleh adapter; gateway outage → false
    // (jangan settle; polling/recovery menyusul).
    async verifyPaidWithProvider(gateway, payment) {
      try {
        const status = await gateway.getStatus(
          payment.order_id,
          payment.final_amount,
          (payment as unknown as { provider_ref?: string | null }).provider_ref ?? null
        );
        return status === "paid";
      } catch {
        return false;
      }
    },
  };
}

/** Midtrans direct-merchant notification. Payload business/provider IDs are ignored. */
export async function handleMidtransWebhook(rawPayload: unknown) {
  const parsed = midtransWebhookSchema.safeParse(rawPayload);
  if (!parsed.success) return { ok: false, reason: "invalid_payload" as const };
  const event = parsed.data;
  const status = event.transaction_status.toLowerCase();
  const fraud = event.fraud_status?.toLowerCase() ?? null;

  // Branch invoice subscription: order_id bukan payment kiosk.
  const { data: kioskPayment } = await createServerClient()
    .from("payments")
    .select("id")
    .eq("order_id", event.order_id)
    .maybeSingle();
  if (!kioskPayment) {
    const result = await handleDirectInvoiceWebhook(
      "midtrans",
      event.order_id,
      event,
      event.signature_key,
      midtransEventId(event),
      event.transaction_status,
      (status === "capture" || status === "settlement") && isMidtransFraudAccepted(fraud),
      status === "expire",
      parseMidtransAmount(event.gross_amount),
      event
    );
    if (result) return result;
  }

  return processDirectWebhook(
    {
      provider: "midtrans",
      orderId: event.order_id,
      eventId: midtransEventId(event),
      eventType: event.transaction_status,
      amount: parseMidtransAmount(event.gross_amount),
      payload: event,
      signaturePayload: event,
      signature: event.signature_key,
      paid: (status === "capture" || status === "settlement") && isMidtransFraudAccepted(fraud),
      expired: status === "expire",
      rejectReason:
        (status === "capture" || status === "settlement") && !isMidtransFraudAccepted(fraud)
          ? "fraud_status tidak diterima"
          : status === "deny" || status === "cancel"
            ? "status Midtrans ditolak"
            : undefined,
      invalidEventId: invalidWebhookEventId(
        "midtrans",
        midtransEventId(event),
        event.signature_key
      ),
    },
    directWebhookDependencies()
  );
}

/** Tripay direct-merchant callback. `rawBody` is verified before any reserialization. */
export async function handleTripayWebhook(rawBody: string, signature: string | null) {
  let rawPayload: unknown;
  try {
    rawPayload = JSON.parse(rawBody);
  } catch {
    return { ok: false, reason: "invalid_payload" as const };
  }
  const parsed = tripayWebhookSchema.safeParse(rawPayload);
  if (!parsed.success || !signature) return { ok: false, reason: "invalid_payload" as const };
  const event = parsed.data;
  const status = event.status.toUpperCase();

  // Branch invoice subscription: order_id bukan payment kiosk.
  const { data: kioskPayment } = await createServerClient()
    .from("payments")
    .select("id")
    .eq("order_id", event.merchant_ref)
    .maybeSingle();
  if (!kioskPayment) {
    const result = await handleDirectInvoiceWebhook(
      "tripay",
      event.merchant_ref,
      rawBody,
      signature,
      tripayEventId(event),
      event.status,
      status === "PAID",
      status === "EXPIRED",
      tripayWebhookAmount(event),
      event
    );
    if (result) return result;
  }

  return processDirectWebhook(
    {
      provider: "tripay",
      orderId: event.merchant_ref,
      eventId: tripayEventId(event),
      eventType: event.status,
      amount: tripayWebhookAmount(event),
      payload: event,
      signaturePayload: rawBody,
      signature,
      paid: status === "PAID",
      expired: status === "EXPIRED",
      rejectReason:
        status === "FAILED" || status === "REFUND" ? "status Tripay ditolak" : undefined,
      invalidEventId: invalidWebhookEventId("tripay", tripayEventId(event), signature),
    },
    directWebhookDependencies()
  );
}


