import "server-only";

import { createServerClient } from "@/lib/supabase/server";
import { redactWebhookPayload } from "@/lib/error-redaction";

/**
 * Log webhook payment (idempotent) — dipakai checkout kiosk (payments) dan
 * invoice subscription (invoice_payments). event_id unik → 23505 = duplicate.
 */

export async function logPaymentWebhook(input: {
  provider?: string;
  eventId: string;
  eventType: string | null;
  payload: unknown;
  /**
   * true/false = provider memakai signature (Midtrans/Tripay). null = provider
   * tanpa signature (Pakasir): "tidak berlaku", bukan "valid".
   */
  signatureValid: boolean | null;
  status: "received" | "processed" | "ignored" | "error";
  paymentId: string | null;
  error?: string;
}): Promise<"logged" | "duplicate"> {
  const supabase = createServerClient();
  const { error } = await supabase.from("payment_webhooks").insert({
    provider: input.provider ?? "pakasir",
    event_id: input.eventId,
    event_type: input.eventType,
    payload: redactWebhookPayload(input.payload),
    signature_valid: input.signatureValid,
    status: input.status,
    payment_id: input.paymentId,
    error: input.error ?? null,
  });
  if (error?.code === "23505") return "duplicate";
  // M4: audit log = best-effort. Jalur penolakan (amount_mismatch/stale/dll)
  // memanggil ini; throw di sini akan mengubah penolakan bersih jadi 500 tanpa
  // manfaat settle. Catat kegagalan, jangan gagalkan transaksi.
  if (error) {
    console.error("[webhook-log] gagal menyimpan log webhook:", error.message);
    return "logged";
  }
  return "logged";
}

/**
 * H3 — idempotency state-aware: klaim event sebagai `received` (non-authoritative)
 * SEBELUM re-verify provider. Bila event_id sudah ada:
 * - status `processed`/`ignored` → "duplicate" (benar-benar sudah ditangani,
 *   jangan settle dua kali).
 * - status `received`/`error` → "retryable" (verify sebelumnya gagal; redelivery
 *   provider BOLEH diproses lagi → jangan blok).
 * Insert sukses → "claimed".
 *
 * ponytail: settle path = insert + update (2 round-trip), redelivery += 1 SELECT
 * untuk baca status. Diterima demi urutan yang benar (persist terminal tidak
 * boleh mendahului settlement → cegah lost-settlement). Pindah ke satu RPC
 * `claim+settle` atomik bila latensi webhook jadi bottleneck.
 */
export async function claimWebhookEvent(input: {
  provider?: string;
  eventId: string;
  eventType: string | null;
  payload: unknown;
  /** Lihat logPaymentWebhook: null = provider tanpa signature (Pakasir). */
  signatureValid: boolean | null;
  paymentId: string | null;
}): Promise<"claimed" | "duplicate" | "retryable"> {
  const supabase = createServerClient();
  const { error } = await supabase.from("payment_webhooks").insert({
    provider: input.provider ?? "pakasir",
    event_id: input.eventId,
    event_type: input.eventType,
    payload: redactWebhookPayload(input.payload),
    signature_valid: input.signatureValid,
    status: "received",
    payment_id: input.paymentId,
    error: null,
  });
  if (!error) return "claimed";
  if (error.code !== "23505") {
    console.error("[webhook-log] gagal mengklaim event:", error.message);
    throw new Error(`Gagal menyimpan webhook payment: ${error.message}`);
  }
  const { data } = await supabase
    .from("payment_webhooks")
    .select("status")
    .eq("event_id", input.eventId)
    .maybeSingle();
  const status = (data as { status: string } | null)?.status;
  return status === "processed" || status === "ignored" ? "duplicate" : "retryable";
}

/** H3 — promosikan baris event yang diklaim ke status authoritative. */
export async function promoteWebhookEvent(input: {
  eventId: string;
  status: "processed" | "ignored" | "error";
  paymentId: string | null;
  error?: string;
}): Promise<void> {
  const supabase = createServerClient();
  const { error } = await supabase
    .from("payment_webhooks")
    .update({ status: input.status, error: input.error ?? null, payment_id: input.paymentId })
    .eq("event_id", input.eventId);
  if (error) {
    console.error("[webhook-log] gagal mempromosikan event:", error.message);
    throw new Error(`Gagal memperbarui webhook payment: ${error.message}`);
  }
}
