/**
 * API error contract — docs/08-api-spec.md §8.2.
 * Pure module (tanpa import next/*) agar bisa di-unit-test.
 */

export const API_ERRORS = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 422,
  PLAN_LIMIT_REACHED: 422,
  SESSION_LIMIT_REACHED: 422,
  STORAGE_FULL: 422,
  STORAGE_UNAVAILABLE: 422,
  SESSION_EXPIRED: 410,
  FEATURE_DISABLED: 403,
  VOUCHER_INVALID: 422,
  VOUCHER_EXPIRED: 422,
  VOUCHER_LIMIT_REACHED: 422,
  VOUCHER_MIN_NOT_MET: 422,
  PAYMENT_ALREADY_PROCESSED: 409,
  PAYMENT_EXPIRED: 409,
  PAYMENT_NOT_FOUND: 404,
  // Subscription lifecycle — docs/02 §2.4.
  SUBSCRIPTION_EXPIRED: 410,
  // POS add-on — docs/pos/01 §7.
  POS_NOT_SUBSCRIBED: 403,
  INSUFFICIENT_STOCK: 409,
  POS_ORDER_NOT_PAYABLE: 409,
  POS_PRODUCT_INACTIVE: 400,
  POS_BOOTH_DISABLED: 409,
  POS_BOOTH_ALREADY_ACTIVE: 409,
  RATE_LIMITED: 429,
  // CAPTCHA/Turnstile gagal atau kedaluwarsa (docs/08 §8.18).
  CAPTCHA_FAILED: 403,
  // Exit PIN kiosk terkunci (docs/05 §5.0) — throttle 5 gagal → 5 menit lock.
  PIN_LOCKED: 429,
  // Maintenance mode global (docs/10 §10.4) — platform_settings.maintenance_mode=true.
  MAINTENANCE_MODE: 503,
  INTERNAL: 500,
} as const;

export type ApiErrorCode = keyof typeof API_ERRORS;

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details: Record<string, unknown>;

  constructor(
    code: ApiErrorCode,
    message: string,
    details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = API_ERRORS[code];
    this.details = details;
  }

  /** Bentuk final untuk NextResponse.json() */
  toBody() {
    return { error: { code: this.code, message: this.message, details: this.details } };
  }
}

/** Envelope sukses — docs/08 §8.2 */
export function dataEnvelope<T>(data: T) {
  return { data };
}

/** Envelope list + meta pagination — docs/08 §8.17 */
export function listEnvelope<T>(items: T[], page: number, limit: number, total: number) {
  return {
    data: items,
    meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}
