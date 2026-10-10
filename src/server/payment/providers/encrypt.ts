/**
 * AES-256-GCM encrypt/decrypt for payment credential server keys.
 * Key: PAYMENT_ENCRYPTION_KEY (64 hex chars = 32 bytes). WAJIB.
 * Format: v1:<ivHex>:<tagHex>:<cipherHex> (version prefix for future key rotation).
 * Pure module (node:crypto only) — testable tanpa server.
 *
 * NEVER log plaintext. Security boundary terpisah dari AUTH_SECRET.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const VERSION = "v1";

/** Validate and return the 64-hex-character encryption key. */
export function requireEncryptionKey(keyHex?: string): string {
  const raw = (keyHex ?? process.env.PAYMENT_ENCRYPTION_KEY ?? "").trim();
  if (!raw) {
    throw new Error(
      "PAYMENT_ENCRYPTION_KEY wajib diset (64 hex char = 32 byte). " +
        "Generate: openssl rand -hex 32. JANGAN pakai AUTH_SECRET."
    );
  }
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error(
      `PAYMENT_ENCRYPTION_KEY harus tepat 64 hex char (32 byte), dapat ${raw.length} char.`
    );
  }
  return raw;
}

function encryptionKeyBuffer(keyHex?: string): Buffer {
  return Buffer.from(requireEncryptionKey(keyHex), "hex");
}

/** Encrypt plaintext → `v1:<ivHex>:<tagHex>:<cipherHex>`. */
// NEVER log plaintext
export function encrypt(plaintext: string, keyHex?: string): string {
  const key = encryptionKeyBuffer(keyHex);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

/** Decrypt `v1:<ivHex>:<tagHex>:<cipherHex>` → plaintext. */
// NEVER log plaintext
export function decrypt(payload: string, keyHex?: string): string {
  const key = encryptionKeyBuffer(keyHex);
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error(
      `Payload enkripsi tidak dikenal (expected "${VERSION}:iv:tag:cipher", got prefix "${parts[0] ?? ""}").`
    );
  }
  const iv = Buffer.from(parts[1]!, "hex");
  const tag = Buffer.from(parts[2]!, "hex");
  const ciphertext = Buffer.from(parts[3]!, "hex");
  if (iv.length !== IV_BYTES) {
    throw new Error(`IV tidak valid: expected ${IV_BYTES} byte, got ${iv.length}`);
  }
  if (tag.length !== TAG_BYTES) {
    throw new Error(`Auth tag tidak valid: expected ${TAG_BYTES} byte, got ${tag.length}`);
  }
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  try {
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    throw new Error("Dekripsi gagal — key salah atau payload terkorupsi.");
  }
}
