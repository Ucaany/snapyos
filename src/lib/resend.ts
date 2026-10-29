import "server-only";

import { Resend } from "resend";

/**
 * Resend delivery wrapper (docs/10 — broadcast email). Env:
 *   RESEND_API_KEY — API key resend.com (wajib)
 *   RESEND_FROM    — alamat/domain pengirim terverifikasi (wajib di production)
 */

export type ResendSendResult = { ok: boolean; id?: string; error?: string };

export function resendFromAddress(): string {
  const from = process.env.RESEND_FROM;
  if (!from) return "SnapyOS <onboarding@resend.dev>";
  return from;
}

/**
 * Resend's shared test sender (onboarding@resend.dev) HANYA mengirim ke email
 * pemilik akun; penerima lain dijawab 200 + message id lalu dibuang diam-diam.
 * Karena itu produksi wajib punya RESEND_FROM di domain terverifikasi —
 * tanpa ini admin melihat status "sent" padahal user tidak menerima apa pun.
 */
export function resendFromIssue(): string | null {
  const from = (process.env.RESEND_FROM ?? "").trim();
  if (!from) return "RESEND_FROM belum dikonfigurasi (pengirim masih onboarding@resend.dev)";
  if (/@resend\.dev/i.test(from)) {
    return "RESEND_FROM memakai domain uji resend.dev — hanya terkirim ke pemilik akun Resend";
  }
  return null;
}

export function hasResendKey(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendEmailWithResend(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<ResendSendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    return { ok: false, error: "RESEND_API_KEY belum dikonfigurasi" };
  }
  const resend = new Resend(key);
  const { data, error } = await resend.emails.send({
    from: resendFromAddress(),
    to: [input.to],
    subject: input.subject,
    html: input.html,
    text: input.text,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data?.id };
}
