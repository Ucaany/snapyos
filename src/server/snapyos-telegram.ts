import "server-only";

/**
 * Pengiriman pesan ke forum topic Telegram SnapyOS.
 *
 * Topic dipisah per jenis informasi supaya aliran revenue tidak tercampur
 * notifikasi operasional:
 * - `revenue`  → SNAPYOS_TELEGRAM_REVENUE_TOPIC_ID
 * - `info`     → SNAPYOS_TELEGRAM_INFO_TOPIC_ID (login, user baru, dsb.)
 * Keduanya fallback ke SNAPYOS_TELEGRAM_TOPIC_ID bila belum diisi.
 */
export type SnapyTopic = "revenue" | "info";

export function resolveSnapyTopicId(topic: SnapyTopic): string | undefined {
  const shared = process.env.SNAPYOS_TELEGRAM_TOPIC_ID;
  const specific =
    topic === "info"
      ? process.env.SNAPYOS_TELEGRAM_INFO_TOPIC_ID
      : process.env.SNAPYOS_TELEGRAM_REVENUE_TOPIC_ID;
  const resolved = (specific && specific.trim()) || (shared && shared.trim()) || undefined;
  return resolved;
}

/**
 * Kirim HTML mentah ke topic Telegram SnapyOS.
 * Tidak melempar — kegagalan notifikasi tidak boleh menggagalkan alur bisnis.
 */
export async function sendSnapyTopicHtml(
  text: string,
  topic: SnapyTopic = "revenue"
): Promise<boolean> {
  const token = process.env.SNAPYOS_TELEGRAM_BOT_TOKEN;
  const chatId = process.env.SNAPYOS_TELEGRAM_CHAT_ID;
  const topicId = resolveSnapyTopicId(topic);
  if (!token || !chatId || !topicId) {
    console.warn(`[snapyos-telegram] topic ${topic} not configured; notification skipped`);
    return false;
  }
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_thread_id: Number(topicId),
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
        link_preview_options: { is_disabled: true },
      }),
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    const result = (await response.json().catch(() => null)) as {
      ok?: boolean;
      description?: string;
    } | null;
    if (!response.ok || result?.ok !== true) {
      console.error("[snapyos-telegram] send failed", {
        topic,
        httpStatus: response.status,
        description: result?.description,
      });
      return false;
    }
    return true;
  } catch (error) {
    console.error(
      "[snapyos-telegram] send failed",
      error instanceof Error ? error.message : "unknown error"
    );
    return false;
  }
}

/** Send a SnapyOS info event (login, user baru) ke topic information. */
export async function notifySnapyTopic(input: {
  title: string;
  businessName?: string;
  ownerName?: string;
  planName?: string;
  amount?: number;
  status?: string;
  daysLeft?: number;
  occurredAt?: string;
}): Promise<void> {
  const lines = [`🔔 <b>${escapeHtml(input.title)}</b>`];
  if (input.businessName) lines.push(`Workspace: <b>${escapeHtml(input.businessName)}</b>`);
  if (input.ownerName) lines.push(`Owner: ${escapeHtml(input.ownerName)}`);
  if (input.planName) lines.push(`Paket: ${escapeHtml(input.planName)}`);
  if (input.amount !== undefined) lines.push(`Nominal: <b>Rp${input.amount.toLocaleString("id-ID")}</b>`);
  if (input.status) lines.push(`Status: ${escapeHtml(input.status)}`);
  if (input.daysLeft !== undefined) lines.push(`Sisa: ${input.daysLeft} hari`);
  if (input.occurredAt) lines.push(`Waktu: ${escapeHtml(new Date(input.occurredAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }))}`);
  await sendSnapyTopicHtml(lines.join("\n"), "info");
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
