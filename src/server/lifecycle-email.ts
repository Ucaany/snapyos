import "server-only";

import { createServerClient } from "@/lib/supabase/server";
import { sendEmailWithResend, hasResendKey } from "@/lib/resend";
import {
  renderLifecycleHtml,
  renderLifecycleText,
  type LifecycleEmailKind,
  type LifecycleEmailInput,
} from "@/lib/lifecycle-email";

/**
 * Pengiriman email lifecycle otomatis — idempoten via tabel lifecycle_emails.
 * Satu email per (email, kind, ref). Kegagalan tidak pernah throw ke pemanggil:
 * email marketing bersifat best-effort, tidak boleh memblokir aktivasi
 * subscription / pembuatan business.
 */

export type LifecycleSendResult = "sent" | "skipped" | "no-key" | "failed";

async function deliverOnce(input: {
  email: string;
  kind: LifecycleEmailKind;
  ref: string;
  template: LifecycleEmailInput;
}): Promise<LifecycleSendResult> {
  if (!input.email) return "skipped";
  if (!hasResendKey()) return "no-key";

  const supabase = createServerClient();

  // Klaim idempoten: hanya satu baris pending per (email, kind, ref) yang
  // menembus insert (unique partial index). Baris ganda → sudah dikirim/diproses.
  const { data: row, error: insertErr } = await supabase
    .from("lifecycle_emails")
    .insert({
      email: input.email.toLowerCase(),
      kind: input.kind,
      ref: input.ref,
      subject: input.template.subject,
    })
    .select("id")
    .maybeSingle();

  if (insertErr) {
    // 23505 = sudah ada baris pending untuk (email, kind, ref) → skip aman.
    if (insertErr.code === "23505") return "skipped";
    console.error(
      "[lifecycle-email] insert failed kind=%s ref=%s: %s",
      input.kind,
      input.ref,
      insertErr.message
    );
    return "failed";
  }
  if (!row) return "skipped";
  const rowId = (row as { id: string }).id;

  const html = renderLifecycleHtml(input.template);
  const text = renderLifecycleText(input.template);
  const result = await sendEmailWithResend({
    to: input.email,
    subject: input.template.subject,
    html,
    text,
  });

  if (result.ok) {
    await supabase
      .from("lifecycle_emails")
      .update({
        status: "sent",
        provider_message_id: result.id ?? null,
        sent_at: new Date().toISOString(),
      })
      .eq("id", rowId);
    return "sent";
  }

  await supabase
    .from("lifecycle_emails")
    .update({ status: "failed", error: result.error ?? "Gagal mengirim" })
    .eq("id", rowId);
  return "failed";
}

/** Email selamat datang saat owner pertama kali membuat business (onboarding). */
export async function sendWelcomeEmail(input: {
  email: string;
  name: string;
  businessName: string;
  businessId: string;
}): Promise<LifecycleSendResult> {
  return deliverOnce({
    email: input.email,
    kind: "welcome",
    ref: input.businessId,
    template: {
      kind: "welcome",
      subject: `Selamat datang di SnapyOS, ${input.name}!`,
      recipientName: input.email,
      lines: [
        `Halo ${input.name},`,
        `Business "${input.businessName}" sudah dibuat dan masa trial Anda telah dimulai.`,
        "Konfigurasi photobox, outlet, dan staff Anda, lalu mulai jualan sesi foto.",
        "Jika butuh bantuan, hubungi tim SnapyOS.",
      ],
    },
  });
}

/** Email saat subscription aktif setelah pembayaran (pay-first, docs/02). */
export async function sendSubscriptionStartedEmail(input: {
  email: string;
  name: string;
  planName: string;
  invoiceId: string;
}): Promise<LifecycleSendResult> {
  return deliverOnce({
    email: input.email,
    kind: "subscription_started",
    ref: input.invoiceId,
    template: {
      kind: "subscription_started",
      subject: "Subscription Anda aktif",
      recipientName: input.email,
      lines: [
        `Halo ${input.name},`,
        `Plan "${input.planName}" Anda sudah aktif. Pembayaran telah kami terima.`,
        "Seluruh fitur plan kini tersedia untuk business Anda.",
      ],
    },
  });
}

/** Pengingat H-3 masa habis berlangganan (cron subscription-expiry-reminder). */
export async function sendExpiryReminderEmail(input: {
  email: string;
  name: string;
  businessId: string;
  expiresAt: string;
}): Promise<LifecycleSendResult> {
  const date = new Date(input.expiresAt);
  const readable = Number.isFinite(date.getTime())
    ? date.toLocaleDateString("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : input.expiresAt;

  return deliverOnce({
    email: input.email,
    kind: "expiry_reminder",
    ref: input.businessId,
    template: {
      kind: "expiry_reminder",
      subject: "Masa berlangganan Anda hampir habis",
      recipientName: input.email,
      lines: [
        `Halo ${input.name},`,
        `Masa berlangganan Anda akan berakhir pada ${readable}.`,
        "Perpanjang sekarang agar layanan photobox Anda tidak terhenti.",
      ],
    },
  });
}
