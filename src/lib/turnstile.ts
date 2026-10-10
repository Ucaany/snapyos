/**
 * Cloudflare Turnstile verification — server-only (docs/08 §8.18, AGENTS.md).
 *
 * Model kepercayaan: token dari widget client TIDAK dipercaya; selalu
 * diverifikasi ke siteverify Cloudflare. Tanpa `TURNSTILE_SECRET_KEY`
 * (dev/self-host) verifikasi DILEWATI — jangan pernah "fail-open" di prod
 * tanpa secret: bila NODE_ENV=production dan secret kosong, blokir (fail-closed).
 */

import { ApiError } from "./api-errors.ts";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const VERIFY_TIMEOUT_MS = 5000;

export function turnstileEnabled(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY?.trim());
}

export function turnstileSiteKey(): string {
  return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? "";
}

/**
 * Verifikasi token Turnstile. Return true = lolos.
 * - Secret kosong + non-production → true (dev).
 * - Secret kosong + production → false (fail-closed).
 * - Cloudflare unreachable/timeout → false (fail-closed).
 * `remoteip` opsional: meningkatkan akurasi tanpa jadi satu-satunya sumber.
 */
export async function verifyTurnstile(
  token: string | null | undefined,
  remoteIp?: string
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) {
    // ponytail: dev tanpa secret = lewat. Production WAJIB set secret.
    return process.env.NODE_ENV !== "production";
  }
  if (!token) return false;

  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) body.set("remoteip", remoteIp);

  try {
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });
    if (!res.ok) return false;
    const json = (await res.json()) as { success?: boolean };
    return json.success === true;
  } catch (err) {
    console.error("[turnstile] verify gagal:", err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * Guard route kiosk publik: verifikasi token, lempar ApiError("CAPTCHA_FAILED")
 * bila gagal. `remoteIp` dari getClientIp(request.headers).
 */
export async function assertTurnstile(
  token: string | null | undefined,
  remoteIp?: string
): Promise<void> {
  if (!(await verifyTurnstile(token, remoteIp))) {
    throw new ApiError("CAPTCHA_FAILED", "Verifikasi keamanan gagal. Muat ulang halaman.");
  }
}
