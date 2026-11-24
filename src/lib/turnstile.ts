/**
 * Cloudflare Turnstile verification — server-only (docs/08 §8.18, AGENTS.md).
 *
 * Model kepercayaan: token dari widget client TIDAK dipercaya; selalu
 * diverifikasi ke siteverify Cloudflare. Tanpa `TURNSTILE_SECRET_KEY`
 * (dev/self-host) verifikasi DILEWATI — jangan pernah "fail-open" di prod
 * tanpa secret: bila NODE_ENV=production dan secret kosong, blokir (fail-closed).
 *
 * `TURNSTILE_DISABLED=1` adalah kill switch operator: mematikan gate CAPTCHA di
 * SEMUA lingkungan (login + buat photobox) tanpa menghapus secret, jadi
 * mengembalikannya cukup menghapus satu variabel. Ini keputusan eksplisit, bukan
 * fail-open implisit — tanpa flag ini perilaku fail-closed tetap utuh.
 */

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const VERIFY_TIMEOUT_MS = 5000;

/** True bila operator mematikan CAPTCHA lewat env (lihat kill switch di atas). */
export function turnstileDisabled(): boolean {
  const raw = (process.env.TURNSTILE_DISABLED ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function turnstileEnabled(): boolean {
  if (turnstileDisabled()) return false;
  return Boolean(process.env.TURNSTILE_SECRET_KEY?.trim());
}

export type TurnstileOptions = {
  remoteIp?: string;
  expectedAction?: string;
  allowedHostnames?: readonly string[];
};

function configuredHostnames(): string[] {
  return (process.env.TURNSTILE_ALLOWED_HOSTNAMES ?? "")
    .split(",")
    .map((hostname) => hostname.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Verifikasi token Turnstile. Return true = lolos.
 * - `TURNSTILE_DISABLED` aktif → true (kill switch operator, semua lingkungan).
 * - Secret kosong + non-production → true (dev).
 * - Secret kosong + production → false (fail-closed).
 * - Cloudflare unreachable/timeout → false (fail-closed).
 * `remoteip` opsional: meningkatkan akurasi tanpa jadi satu-satunya sumber.
 */
export async function verifyTurnstile(
  token: string | null | undefined,
  options: TurnstileOptions | string = {}
): Promise<boolean> {
  if (turnstileDisabled()) return true;
  const normalized = typeof options === "string" ? { remoteIp: options } : options;
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }
  if (!token) return false;

  const allowedHostnames = normalized.allowedHostnames ?? configuredHostnames();
  if (process.env.NODE_ENV === "production" && allowedHostnames.length === 0) {
    return false;
  }

  const body = new URLSearchParams({ secret, response: token });
  if (normalized.remoteIp) body.set("remoteip", normalized.remoteIp);

  try {
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });
    if (!res.ok) return false;
    const json = (await res.json()) as {
      success?: boolean;
      action?: string;
      hostname?: string;
    };
    if (json.success !== true) return false;
    if (normalized.expectedAction && json.action !== normalized.expectedAction) return false;
    if (
      allowedHostnames.length > 0 &&
      (!json.hostname || !allowedHostnames.includes(json.hostname.toLowerCase()))
    ) {
      return false;
    }
    return true;
  } catch (err) {
    console.error("[turnstile] verify gagal:", err instanceof Error ? err.message : err);
    return false;
  }
}
