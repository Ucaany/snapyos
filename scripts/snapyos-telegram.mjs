const EVENT_LABELS = {
  "user.created": "User baru dibuat",
  "business.created": "Workspace baru",
  "subscription.started": "Subscription aktif",
  "subscription.paid": "Pembayaran subscription diterima",
  "subscription.status": "Status subscription berubah",
  "subscription.expired": "Subscription berakhir",
  "subscription.cancelled": "Subscription dibatalkan",
  "subscription.ending_soon": "Subscription segera berakhir",
};

export function formatSnapyEvent(event) {
  const label = EVENT_LABELS[event.type] ?? "Pembaruan SnapyOS";
  const lines = [`🔔 <b>${escapeHtml(label)}</b>`];
  if (event.businessName) lines.push(`Workspace: <b>${escapeHtml(event.businessName)}</b>`);
  if (event.ownerName) lines.push(`Owner: ${escapeHtml(event.ownerName)}`);
  if (event.planName) lines.push(`Paket: ${escapeHtml(event.planName)}`);
  if (Number.isFinite(event.amount)) lines.push(`Nominal: <b>Rp${Number(event.amount).toLocaleString("id-ID")}</b>`);
  if (event.status) lines.push(`Status: ${escapeHtml(event.status)}`);
  if (event.daysLeft !== undefined) lines.push(`Sisa: ${event.daysLeft} hari`);
  if (event.occurredAt) lines.push(`Waktu: ${escapeHtml(new Date(event.occurredAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }))}`);
  return lines.join("\n");
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function buildTelegramUrl(token, chatId, topicId) {
  if (!token || !chatId) throw new Error("Telegram bot token dan chat id wajib diset");
  if (!topicId) throw new Error("Telegram topic id wajib diset");
  return `https://api.telegram.org/bot${token}/sendMessage`;
}

export async function sendTelegramMessage({ token, chatId, topicId, text, fetchImpl = fetch }) {
  const url = buildTelegramUrl(token, chatId, topicId);
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, message_thread_id: Number(topicId), text, parse_mode: "HTML", disable_web_page_preview: true }),
    cache: "no-store",
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.ok !== true) throw new Error(`Telegram sendMessage gagal (HTTP ${response.status})`);
  return result.result?.message_id ?? null;
}
