/**
 * AES-256-GCM encrypt/decrypt for payment credential server keys.
 * Key: PAYMENT_ENCRYPTION_KEY (64 hex chars = 32 bytes). WAJIB.
 * Format: v1:<ivHex>:<tagHex>:<cipherHex> | v2:<ivHex>:<tagHex>:<cipherHex>.
 * v2 = PAYMENT_ENCRYPTION_KEY_V2 (key rotation). Encrypt baru selalu v2
 * jika key v2 tersedia; decrypt mencoba v2 lalu v1.
 * Pure module (node:crypto only) — testable tanpa server.
 *
 * NEVER log plaintext. Security boundary terpisah dari AUTH_SECRET.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

const SUPPORTED_VERSIONS = ["v1", "v2"] as const;
type Version = (typeof SUPPORTED_VERSIONS)[number];

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

function keyBuffer(keyHex: string): Buffer {
  return Buffer.from(keyHex, "hex");
}

function resolveEncryptKey(): { version: Version; key: Buffer } {
  const v2Hex = (process.env.PAYMENT_ENCRYPTION_KEY_V2 ?? "").trim();
  if (v2Hex && /^[0-9a-fA-F]{64}$/.test(v2Hex)) {
    return { version: "v2", key: keyBuffer(v2Hex) };
  }
  return { version: "v1", key: keyBuffer(requireEncryptionKey()) };
}

function resolveDecryptKey(version: Version, explicitKeyHex?: string): Buffer {
  if (explicitKeyHex) return keyBuffer(explicitKeyHex);
  if (version === "v2") {
    const v2Hex = (process.env.PAYMENT_ENCRYPTION_KEY_V2 ?? "").trim();
    if (v2Hex && /^[0-9a-fA-F]{64}$/.test(v2Hex)) {
      return keyBuffer(v2Hex);
    }
    throw new Error("PAYMENT_ENCRYPTION_KEY_V2 diperlukan untuk mendekripsi payload v2.");
  }
  return keyBuffer(requireEncryptionKey());
}

function encryptRaw(plaintext: string, version: Version, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${version}:${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

function decryptRaw(payload: string, key: Buffer): string {
  const parts = payload.split(":");
  if (parts.length !== 4 || !SUPPORTED_VERSIONS.includes(parts[0] as Version)) {
    throw new Error(
      `Payload enkripsi tidak dikenal (expected "v1|v2:iv:tag:cipher", got prefix "${parts[0] ?? ""}").`
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
    throw new Error("Dekripsi gagal: key salah atau payload terkorupsi.");
  }
}

/** Encrypt plaintext → `v2:<ivHex>:<tagHex>:<cipherHex>` (atau v1 jika key v2 belum diset). */
// NEVER log plaintext
export function encrypt(plaintext: string, keyHex?: string): string {
  if (keyHex) {
    return encryptRaw(plaintext, "v1", keyBuffer(keyHex));
  }
  const { version, key } = resolveEncryptKey();
  return encryptRaw(plaintext, version, key);
}

/** Decrypt `v1|v2:<ivHex>:<tagHex>:<cipherHex>` → plaintext. */
// NEVER log plaintext
export function decrypt(payload: string, keyHex?: string): string {
  const version = payload.split(":")[0] as Version;
  const key = resolveDecryptKey(version, keyHex);
  return decryptRaw(payload, key);
}

/** Re-encrypt payload dari versi/key lama ke key terbaru. Idempotent: payload sudah v2 → no-op. */
export function reEncrypt(payload: string): { rotated: boolean; payload: string } {
  const { version: targetVersion, key: targetKey } = resolveEncryptKey();
  const currentVersion = payload.split(":")[0] as Version;
  if (currentVersion === targetVersion) {
    return { rotated: false, payload };
  }
  const plaintext = decrypt(payload);
  return { rotated: true, payload: encryptRaw(plaintext, targetVersion, targetKey) };
}
