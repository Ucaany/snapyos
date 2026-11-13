/**
 * Email transaksional auth — undangan staff (AUTH-03) dan reset password
 * (AUTH-01). Brutalist, satu bahasa visual dengan email lifecycle/broadcast.
 *
 * Tidak pernah memuat password/PIN. Satu-satunya rahasia di email adalah token
 * sekali pakai yang kedaluwarsa.
 */

import "server-only";

import { publicBaseUrl } from "@/lib/public-url";
import { sendEmailWithResend, type ResendSendResult } from "@/lib/resend";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function render(input: {
  accent: string;
  tagline: string;
  title: string;
  lines: string[];
  ctaLabel: string;
  ctaUrl: string;
}): string {
  const paragraphs = input.lines
    .map((line) => `<p style="margin:0 0 16px 0;">${escapeHtml(line)}</p>`)
    .join("");
  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(input.title)}</title>
</head>
<body style="margin:0;padding:0;background:#e8e6e1;color:#111111;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e8e6e1;">
    <tr>
      <td align="center" style="padding:24px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;border:2px solid #111111;background:#f5f4f0;box-shadow:6px 6px 0 0 #111111;">
          <tr>
            <td style="border-bottom:2px solid #111111;background:#111111;padding:14px 20px;">
              <span style="font-weight:700;font-size:18px;letter-spacing:0.05em;color:#f5f4f0;">SnapyOS<span style="color:${input.accent};">&reg;</span></span>
            </td>
          </tr>
          <tr>
            <td style="padding:20px;border-bottom:2px solid #111111;background:${input.accent};">
              <span style="font-size:10px;letter-spacing:0.2em;color:#111111;text-transform:uppercase;font-weight:700;">${escapeHtml(input.tagline)}</span>
              <h1 style="margin:8px 0 0 0;font-size:26px;line-height:1.1;letter-spacing:0.02em;text-transform:uppercase;color:#111111;">${escapeHtml(input.title)}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 20px;">
              ${paragraphs}
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
                <tr>
                  <td style="background:#111111;border:2px solid #111111;box-shadow:4px 4px 0 0 ${input.accent};">
                    <a href="${escapeHtml(input.ctaUrl)}" style="display:inline-block;padding:12px 20px;color:#f5f4f0;font-weight:700;text-decoration:none;letter-spacing:0.08em;text-transform:uppercase;font-size:13px;">${escapeHtml(input.ctaLabel)}</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0;font-size:12px;line-height:1.6;color:#6b6b6b;word-break:break-all;">${escapeHtml(input.ctaUrl)}</p>
            </td>
          </tr>
          <tr>
            <td style="border-top:2px solid #111111;padding:14px 20px;background:#e8e6e1;">
              <p style="margin:0;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:#6b6b6b;">SnapyOS&reg; platform — email otomatis, jangan balas.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendStaffInvitationEmail(input: {
  to: string;
  businessName: string;
  inviterName: string | null;
  role: "manager" | "staff";
  token: string;
}): Promise<ResendSendResult> {
  const url = `${publicBaseUrl()}/invite/${encodeURIComponent(input.token)}`;
  const roleLabel = input.role === "manager" ? "manager" : "staff";
  const lines = [
    `${input.inviterName ?? "Owner"} mengundang Anda bergabung sebagai ${roleLabel} di ${input.businessName}.`,
    "Undangan ini hanya berlaku jika Anda menyetujuinya. Tautan berlaku 7 hari dan hanya bisa dipakai sekali.",
    "Jika Anda tidak mengenal pengirimnya, abaikan email ini — tidak ada akses yang diberikan tanpa persetujuan Anda.",
  ];
  return sendEmailWithResend({
    to: input.to,
    subject: `Undangan ${roleLabel} — ${input.businessName}`,
    html: render({
      accent: "#ffd400",
      tagline: "Undangan staff",
      title: "Konfirmasi undangan",
      lines,
      ctaLabel: "Tinjau undangan",
      ctaUrl: url,
    }),
    text: `${lines.join("\n\n")}\n\n${url}`,
  });
}

export async function sendPasswordResetEmail(input: {
  to: string;
  name: string | null;
  token: string;
}): Promise<ResendSendResult> {
  const url = `${publicBaseUrl()}/reset-password/${encodeURIComponent(input.token)}`;
  const lines = [
    `Halo ${input.name ?? "pengguna SnapyOS"}, kami menerima permintaan reset password untuk akun ini.`,
    "Tautan berlaku 1 jam dan hanya bisa dipakai sekali. Setelah password diganti, semua sesi lama dicabut.",
    "Jika Anda tidak meminta reset, abaikan email ini. Password lama tetap berlaku.",
  ];
  return sendEmailWithResend({
    to: input.to,
    subject: "Reset password SnapyOS",
    html: render({
      accent: "#7c5cff",
      tagline: "Keamanan akun",
      title: "Reset password",
      lines,
      ctaLabel: "Buat password baru",
      ctaUrl: url,
    }),
    text: `${lines.join("\n\n")}\n\n${url}`,
  });
}
