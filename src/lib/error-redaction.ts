/**
 * Error redaction — sanitizer bersama untuk `console.error` API + webhook
 * diagnostics + payload apa pun sebelum di-log. Prinsip:
 *   - Nilai di bawah key sensitif (server_key, api_key, password, token,
 *     signature, qr_string) di-`[REDACTED]`.
 *   - Email di dalam string di-mask jadi `***@domain` (local-part diganti,
 *     domain tetap agar audit trail tetap berguna).
 *   - Rekursif untuk object/array; primitif non-string diteruskan apa adanya.
 *
 * Dipakai:
 *   - src/lib/api-route.ts → wrap `console.error` di `toErrorResponse`.
 *   - src/server/payment/webhook-log.ts → re-export `redactWebhookPayload`
 *     (backwards compatible; sekarang termasuk key & email yang lebih luas).
 */

const SECRET_KEY_RE =
  /(?:secret|private[_-]?key|server[_-]?key|api[_-]?key|authorization|password|token|signature|qr[_-]?string)/i;

const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g;

/** Ganti local-part email menjadi `***` — pertahankan domain untuk konteks. */
export function redactEmailString(value: string): string {
  return value.replace(EMAIL_RE, "***@$1");
}

/**
 * Sanitasi rekursif — dipakai untuk log / persist payload diagnostik. Nilai
 * di bawah key sensitif diganti `[REDACTED]` (tidak diintip isinya) dan
 * seluruh string yang mengandung email di-mask jadi `***@domain`.
 */
export function redactSensitive<T>(value: T): T {
  return redactInternal(value) as T;
}

function redactInternal(value: unknown): unknown {
  if (typeof value === "string") return redactEmailString(value);
  if (Array.isArray(value)) return value.map(redactInternal);
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactEmailString(value.message),
      stack: value.stack ? redactEmailString(value.stack) : undefined,
    };
  }
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      SECRET_KEY_RE.test(key) ? "[REDACTED]" : redactInternal(item),
    ])
  );
}

/**
 * Backwards-compatible alias: webhook diagnostics dulu memakai
 * `redactWebhookPayload`. Sekarang delegasi ke `redactSensitive` sehingga
 * key `signature` / `qr_string` juga tersembunyi dan email di dalam raw
 * body ikut di-mask.
 */
export const redactWebhookPayload = redactSensitive;
