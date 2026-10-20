import type { GatewayProvider, PaymentGateway } from "../server/payment/providers/types.ts";

export type DirectWebhookProvider = Extract<GatewayProvider, "midtrans" | "tripay">;
export type DirectPayment = {
  id: string;
  business_id: string;
  checkout_session_id: string;
  credential_id: string | null;
  final_amount: number;
  total_amount: number | null;
  /** Provider order reference (dipakai re-verify getStatus). */
  order_id: string;
  provider_ref?: string | null;
};

export type DirectWebhookLog = {
  provider: DirectWebhookProvider;
  eventId: string;
  eventType: string | null;
  payload: unknown;
  signatureValid: boolean;
  status: "received" | "processed" | "ignored" | "error";
  paymentId: string | null;
  error?: string;
};

export type DirectWebhookDependencies = {
  findPayment(orderId: string): Promise<DirectPayment | null>;
  resolveGateway(credentialId: string): Promise<PaymentGateway | null>;
  persist(log: DirectWebhookLog): Promise<"logged" | "duplicate">;
  /**
   * H3 — klaim event sebagai `received` sebelum re-verify. "duplicate" = sudah
   * ditangani (blokir); "claimed"/"retryable" = lanjut.
   */
  claimEvent?(log: DirectWebhookLog): Promise<"claimed" | "duplicate" | "retryable">;
  /** H3 — promosikan baris terkklaim ke status authoritative setelah settle. */
  promoteEvent?(
    eventId: string,
    status: "processed" | "ignored" | "error",
    error?: string
  ): Promise<void>;
  transitionToPaid(paymentId: string): Promise<boolean>;
  transitionToExpired(paymentId: string): Promise<boolean>;
  loadCheckout(businessId: string, checkoutId: string): Promise<unknown>;
  runPaidSideEffects(payment: DirectPayment, checkout: unknown): Promise<unknown>;
  /**
   * Defense-in-depth (opsional): re-fetch status pembayaran langsung dari
   * provider (server-to-server) sebelum settlement. `gateway` = adapter yang
   * sudah di-resolve. Return true HANYA bila provider mengonfirmasi "paid".
   * Bila tidak disediakan → dilewati (mis. unit test), tapi produksi WAJIB
   * menyediakannya agar webhook body tak menjadi satu-satunya sumber kebenaran.
   */
  verifyPaidWithProvider?(gateway: PaymentGateway, payment: DirectPayment): Promise<boolean>;
};

export type DirectWebhookInput = {
  provider: DirectWebhookProvider;
  orderId: string;
  eventId: string;
  eventType: string;
  amount: number | null;
  payload: unknown;
  signaturePayload: unknown;
  signature: string;
  paid: boolean;
  expired: boolean;
  rejectReason?: string;
  invalidEventId: string;
};

export type DirectWebhookResult = {
  ok: boolean;
  reason:
    | "unknown_order"
    | "missing_credential"
    | "credential_mismatch"
    | "invalid_signature"
    | "amount_mismatch"
    | "provider_not_paid"
    | "rejected"
    | "duplicate_event"
    | "paid"
    | "expired"
    | "no_transition";
};

async function reject(
  input: DirectWebhookInput,
  deps: DirectWebhookDependencies,
  payment: DirectPayment | null,
  reason: DirectWebhookResult["reason"],
  error: string,
  signatureValid = false
): Promise<DirectWebhookResult> {
  await deps.persist({
    provider: input.provider,
    eventId: signatureValid ? input.eventId : input.invalidEventId,
    eventType: input.eventType,
    payload: input.payload,
    signatureValid,
    status: reason === "unknown_order" ? "ignored" : "error",
    paymentId: payment?.id ?? null,
    error,
  });
  return { ok: false, reason };
}

/** Resolve payment only by provider order reference, then its stored credential. */
export async function processDirectWebhook(
  input: DirectWebhookInput,
  deps: DirectWebhookDependencies
): Promise<DirectWebhookResult> {
  const payment = await deps.findPayment(input.orderId);
  if (!payment) return reject(input, deps, null, "unknown_order", "order_id tidak dikenal");
  if (!payment.credential_id) {
    return reject(input, deps, payment, "missing_credential", "payment bukan direct merchant");
  }

  const gateway = await deps.resolveGateway(payment.credential_id);
  if (!gateway || gateway.provider !== input.provider) {
    return reject(input, deps, payment, "credential_mismatch", "provider credential tidak cocok");
  }
  if (!gateway.verifyWebhook(input.signaturePayload, input.signature)) {
    return reject(input, deps, payment, "invalid_signature", "signature tidak valid");
  }
  // Nominal callback direct bisa memuat admin fee provider: Tripay mengirim
  // `total_amount` (final_amount + fee), Midtrans mengirim `gross_amount`.
  // Terima nominal == final_amount ATAU == total_amount (bila tercatat).
  // Fail-closed selain itu: null / nilai lain → reject. Sengaja TIDAK menerima
  // rentang/ambang, hanya dua nilai eksak yang sah (jangan longgarkan tanpa
  // keputusan eksplisit, lihat docs/06 §6.7.1).
  if (
    input.amount === null ||
    (input.amount !== payment.final_amount &&
      input.amount !== (payment.total_amount ?? payment.final_amount))
  ) {
    return reject(input, deps, payment, "amount_mismatch", "amount tidak cocok", true);
  }
  if (input.rejectReason) {
    return reject(input, deps, payment, "rejected", input.rejectReason, true);
  }

  // H3 — klaim event sebagai `received` SEBELUM re-verify provider. Baris
  // status `processed`/`ignored` = benar-benar sudah ditangani → blokir.
  // `received`/`error` = percobaan sebelumnya gagal → redelivery boleh lanjut.
  const baseLog: DirectWebhookLog = {
    provider: input.provider,
    eventId: input.eventId,
    eventType: input.eventType,
    payload: input.payload,
    signatureValid: true,
    status: "received",
    paymentId: payment.id,
  };
  if (deps.claimEvent) {
    const claim = await deps.claimEvent(baseLog);
    if (claim === "duplicate") return { ok: true, reason: "duplicate_event" };
  } else {
    const duplicate = await deps.persist({ ...baseLog, status: "processed" });
    if (duplicate === "duplicate") return { ok: true, reason: "duplicate_event" };
  }

  if (input.paid) {
    // Defense-in-depth server-to-server: signature + body amount saja tidak
    // cukup. Re-fetch status langsung dari provider sebelum settlement; bila
    // provider outage/non-paid → jangan settle (baris tetap `received`/`error`,
    // polling/recovery & redelivery akan mencoba lagi). Fail-closed bila dep
    // tersedia.
    if (deps.verifyPaidWithProvider) {
      const verified = await deps.verifyPaidWithProvider(gateway, payment);
      if (!verified) {
        await deps.promoteEvent?.(
          input.eventId,
          "error",
          "status provider tidak terkonfirmasi paid"
        );
        return reject(
          input,
          deps,
          payment,
          "provider_not_paid",
          "status provider tidak terkonfirmasi paid",
          true
        );
      }
    }
    if (await deps.transitionToPaid(payment.id)) {
      const checkout = await deps.loadCheckout(payment.business_id, payment.checkout_session_id);
      await deps.runPaidSideEffects(payment, checkout);
      await deps.promoteEvent?.(input.eventId, "processed");
      return { ok: true, reason: "paid" };
    }
  }
  if (input.expired && (await deps.transitionToExpired(payment.id))) {
    await deps.promoteEvent?.(input.eventId, "processed");
    return { ok: true, reason: "expired" };
  }
  return { ok: true, reason: "no_transition" };
}
