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
