/**
 * Lifecycle email templates — email marketing otomatis (Resend).
 * Tiga jenis: welcome (onboarding pertama), subscription_started (plan aktif
 * setelah pembayaran), expiry_reminder (H-3 masa habis).
 * HTML brutalist (docs/11) — gaya sama dengan broadcast-email.ts.
 * Satu-satunya bahasa visual SnapyOS: Neo-Brutalism.
 */

export type LifecycleEmailKind =
  | "welcome"
  | "subscription_started"
  | "expiry_reminder";

const KIND_ACCENT: Record<LifecycleEmailKind, string> = {
  welcome: "#34d399",
  subscription_started: "#ffd400",
  expiry_reminder: "#ff5c5c",
};

const KIND_TAGLINE: Record<LifecycleEmailKind, string> = {
  welcome: "/// Selamat bergabung",
  subscription_started: "/// Subscription aktif",
  expiry_reminder: "/// Masa aktif hampir habis",
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function paragraphs(lines: string[]): string {
  return lines
    .map((l) => `<p style="margin:0 0 16px 0;">${escapeHtml(l)}</p>`)
    .join("");
}

export type LifecycleEmailInput = {
  kind: LifecycleEmailKind;
  subject: string;
  recipientName: string;
  lines: string[];
};

export function renderLifecycleHtml(input: LifecycleEmailInput): string {
  const accent = KIND_ACCENT[input.kind];
  const tagline = KIND_TAGLINE[input.kind];
  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(input.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#e8e6e1;color:#111111;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e8e6e1;">
    <tr>
      <td align="center" style="padding:24px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;border:2px solid #111111;background:#f5f4f0;box-shadow:6px 6px 0 0 #111111;">
          <tr>
            <td style="border-bottom:2px solid #111111;background:#111111;padding:14px 20px;">
              <span style="font-weight:700;font-size:18px;letter-spacing:0.05em;color:#f5f4f0;">SnapyOS<span style="color:${accent};">&reg;</span></span>
            </td>
          </tr>
          <tr>
            <td style="padding:20px;border-bottom:2px solid #111111;background:${accent};">
              <span style="font-size:10px;letter-spacing:0.2em;color:#111111;text-transform:uppercase;font-weight:700;">${tagline}</span>
              <h1 style="margin:8px 0 0 0;font-size:26px;line-height:1.1;letter-spacing:0.02em;text-transform:uppercase;color:#111111;">${escapeHtml(input.subject)}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 20px;">
              ${paragraphs(input.lines)}
            </td>
          </tr>
          <tr>
            <td style="border-top:2px solid #111111;padding:14px 20px;background:#e8e6e1;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:#6b6b6b;">
                    SnapyOS&reg; platform<br />Email otomatis — jangan balas.
                  </td>
                  <td align="right" style="font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:#111111;">
                    ${escapeHtml(input.recipientName)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function renderLifecycleText(input: LifecycleEmailInput): string {
  const tagline = KIND_TAGLINE[input.kind];
  return `SnapyOS® — ${tagline}\n${input.subject}\n\n${input.lines.join("\n\n")}\n\nEmail otomatis, jangan balas.`;
}
