const SECRET_KEY = /(?:secret|private[_-]?key|server[_-]?key|api[_-]?key|authorization|password|token)/i;

/** Persist webhook diagnostics without accepting attacker-supplied secret literals. */
export function redactWebhookPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactWebhookPayload);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      SECRET_KEY.test(key) ? "[REDACTED]" : redactWebhookPayload(item),
    ])
  );
}
