/**
 * Auth cron helper — Phase 11 hardening.
 * Fail-closed: secret wajib ada; perbandingan timing-safe.
 * Dev opt-in eksplisit: RETENTION_CRON_OPEN=1 (tanpa secret).
 */
import { timingSafeEqual } from "node:crypto";

export function bearerMatches(header: string | null, expected: string): boolean {
  const got = header ?? "";
  const want = `Bearer ${expected}`;
  if (got.length !== want.length) return false;
  try {
    return timingSafeEqual(Buffer.from(got), Buffer.from(want));
  } catch {
    return false;
  }
}
