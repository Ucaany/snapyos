/**
 * Token undangan staff & reset password — aturan murni (tanpa server-only)
 * supaya bisa diuji langsung dengan node:test.
 *
 * Plaintext token hanya dikirim ke penerima (email/link). Database menyimpan
 * SHA-256 hex; token tidak bisa dipulihkan dari database.
 */

import { createHash, randomBytes } from "node:crypto";

/** 32 byte = 256 bit entropi; base64url 43 karakter. */
export const AUTH_TOKEN_BYTES = 32;

/** Undangan staff berlaku 7 hari. */
export const STAFF_INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Reset password berlaku 1 jam — cukup untuk email, pendek untuk token sensitif. */
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

export function generateAuthToken(): string {
  return randomBytes(AUTH_TOKEN_BYTES).toString("base64url");
}

export function hashAuthToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Token hanya sah bila belum dipakai/diterima/direvoke dan belum kedaluwarsa. */
export function isAuthTokenUsable(
  record: {
    expires_at: string;
    used_at?: string | null;
    accepted_at?: string | null;
    revoked_at?: string | null;
  },
  now: number = Date.now()
): boolean {
  if (record.used_at || record.accepted_at || record.revoked_at) return false;
  const expires = new Date(record.expires_at).getTime();
  return Number.isFinite(expires) && expires > now;
}

/** Email undangan harus cocok dengan akun yang menerima (case-insensitive). */
export function invitationEmailMatches(invitedEmail: string, accountEmail: string): boolean {
  return invitedEmail.trim().toLowerCase() === accountEmail.trim().toLowerCase();
}

/** Token dari URL: hanya base64url 43 karakter; tolak bentuk lain lebih awal. */
export function isWellFormedAuthToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}
