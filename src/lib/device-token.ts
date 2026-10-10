/**
 * Device pairing — docs/05 §5.0 (device token hash di server, token asli di localStorage).
 * Kode aktivasi: random, sekali pakai, expire ~5 menit (docs/05 §5.0 Keamanan).
 * Murni node:crypto — dipakai server + test (bukan client).
 *
 * Exit-PIN: berbeda dari device token. Karena PIN pendek (biasanya 4–6 digit)
 * dan sering diketik ulang, sha256 langsung → mudah di-brute. Kita pakai
 * argon2id (@node-rs/argon2) untuk hash + verify. Digabung throttle di
 * server (lihat `verifyDeviceExit`) agar attempt gagal beruntun terkunci.
 */

import { createHash, randomBytes, randomInt } from "node:crypto";
import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";

// `Algorithm` di @node-rs/argon2 adalah `const enum` — `isolatedModules`
// melarang import const enum. Konstanta numeriknya stabil (Argon2id = 2).
const ARGON2ID = 2;

const TOKEN_BYTES = 32;

/** Alfabet bebas karakter ambigu (tanpa 0/O/1/I/L). */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export const ACTIVATION_CODE_LENGTH = 6;
export const ACTIVATION_TTL_MS = 5 * 60 * 1000;

/** Token persisten device (64 hex chars) — dikirim ke device, disimpan localStorage. */
export function generateDeviceToken(): string {
  return randomBytes(TOKEN_BYTES).toString("hex");
}

/** Server hanya menyimpan hash sha256 (docs/05 §5.0 Keamanan). */
export function hashDeviceToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Kode aktivasi 6 karakter sekali pakai. */
export function generateActivationCode(length: number = ACTIVATION_CODE_LENGTH): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return out;
}

/** Masa kedaluwarsa kode aktivasi (ISO). */
export function activationExpiresAt(now = Date.now()): string {
  return new Date(now + ACTIVATION_TTL_MS).toISOString();
}

/** Token result online (docs/05 §5.13) — 32 hex chars, di-issue saat paid. */
export function generateResultToken(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Parameter argon2id untuk exit PIN photobox. Cost dipilih agar verify di
 * server ≤ ~50 ms pada hardware biasa (interaktif; tidak menahan request
 * booth) tapi masih tebal cukup untuk melawan brute pada PIN 4–6 digit
 * (bila hash bocor). Kita tidak menyimpan salt terpisah — encoded string
 * dari argon2 sudah berisi salt + parameter.
 */
const ARGON2_PIN_OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19_456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

/** Hash PIN keluar photobox dengan argon2id (encoded string self-contained). */
export function hashDevicePin(pin: string): Promise<string> {
  return argonHash(pin, ARGON2_PIN_OPTIONS);
}

/** Verifikasi PIN thd hash argon2id; false untuk hash format lain (sha256 lama). */
export async function verifyDevicePin(pin: string, hash: string): Promise<boolean> {
  if (!hash.startsWith("$argon2")) return false;
  try {
    return await argonVerify(hash, pin);
  } catch {
    return false;
  }
}
