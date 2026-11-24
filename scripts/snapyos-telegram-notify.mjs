import { formatSnapyEvent, sendTelegramMessage } from "./snapyos-telegram.mjs";

const SECRET_KEYS = /(?:^|_)(?:TOKEN|SECRET|KEY|PASSWORD)(?:$|_)/i;

export async function notifySnapyTopic(event) {
  const token = process.env.SNAPYOS_TELEGRAM_BOT_TOKEN;
  const chatId = process.env.SNAPYOS_TELEGRAM_CHAT_ID;
  const topicId = process.env.SNAPYOS_TELEGRAM_TOPIC_ID;
  if (!token || !chatId || !topicId) {
    console.warn("[snapyos-telegram] not configured; event skipped", event.type);
    return { sent: false, reason: "not_configured" };
  }
  try {
    const text = formatSnapyEvent({ ...event, occurredAt: event.occurredAt ?? new Date().toISOString() });
    const messageId = await sendTelegramMessage({ token, chatId, topicId, text });
    return { sent: true, messageId };
  } catch (error) {
    const configKeyNames = Object.keys(process.env).filter((key) => SECRET_KEYS.test(key));
    console.error("[snapyos-telegram] notification failed", {
      event: event.type,
      error: error instanceof Error ? error.message : "unknown error",
      configuredSecretKeyNames: configKeyNames,
    });
    return { sent: false, reason: "delivery_failed" };
  }
}
