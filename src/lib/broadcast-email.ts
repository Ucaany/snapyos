/**
 * Broadcast email templates — HTML brutalist (docs/11) untuk email marketing /
 * pengumuman platform. Satu template per "jenis" (kind) agar hasil pengiriman
 * jelas & terbedakan. Dipakai src/server/admin/broadcast.ts (delivery Resend).
 * Satu-satunya bahasa visual SnapyOS: Neo-Brutalism.
 */

export type BroadcastKind = "announcement" | "promo" | "newsletter" | "event" | "system";
export type BroadcastTemplateKey = "default" | BroadcastKind;

/** Metadata label + aksen per jenis (untuk UI picker + render header). */
export const BROADCAST_KIND_LABEL: Record<BroadcastKind, string> = {
  announcement: "Pengumuman",
  promo: "Promo / Diskon",
  newsletter: "Newsletter",
  event: "Event / Acara",
  system: "Sistem / Teknis",
};

export const BROADCAST_KIND_TAGLINE: Record<BroadcastKind, string> = {
  announcement: "/// Official announcement",
  promo: "/// Limited offer",
  newsletter: "/// Newsletter edition",
  event: "/// Event notice",
  system: "/// System notice",
};

const KIND_ACCENT: Record<BroadcastKind, string> = {
  announcement: "#ffd400",
  promo: "#ff5c5c",
  newsletter: "#7c5cff",
  event: "#34d399",
  system: "#111111",
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Body teks biasa → paragraf HTML (baris ganda = pemisah paragraf). */
function bodyToHtml(body: string): string {
  return escapeHtml(body)
    .split(/\n{2,}/)
    .map((block) => `<p style="margin:0 0 16px 0;">${block.replace(/\n/g, "<br />")}</p>`)
    .join("");
}

/**
 * Template efektif: `template_key` eksplisit menang atas `kind`; "default"
 * jatuh ke `kind`. Ini membuat pemilih Template benar-benar mengubah render
 * (bukan sekadar metadata yang tersimpan).
 */
function resolveKind(
  templateKey: BroadcastTemplateKey | undefined,
  kind: BroadcastKind
): BroadcastKind {
  if (!templateKey || templateKey === "default") return kind;
  return templateKey;
}

export function renderBroadcastHtml(input: {
  subject: string;
  body: string;
  recipientName: string;
  kind: BroadcastKind;
  templateKey?: BroadcastTemplateKey;
}): string {
  const kind: BroadcastKind = resolveKind(input.templateKey, input.kind ?? "announcement");
  const accent = KIND_ACCENT[kind] ?? "#111111";
  const tagline = BROADCAST_KIND_TAGLINE[kind];
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
              ${bodyToHtml(input.body)}
            </td>
          </tr>
          <tr>
            <td style="border-top:2px solid #111111;padding:14px 20px;background:#e8e6e1;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:#6b6b6b;">
                    SnapyOS&reg; platform<br />Email otomatis: jangan balas.
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

export function renderBroadcastText(input: {
  subject: string;
  body: string;
  kind: BroadcastKind;
  templateKey?: BroadcastTemplateKey;
}): string {
  const kind = resolveKind(input.templateKey, input.kind ?? "announcement");
  const tagline = BROADCAST_KIND_TAGLINE[kind];
  return `SnapyOS®: ${tagline}\n${input.subject}\n\n${input.body}\n\nEmail otomatis, jangan balas.`;
}
