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

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

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
  // Format 5 segmen: versi:keyId:iv:tag:cipher. keyId = 8 hex pertama dari
  // sha256(key). Tanpa ini, "v2" hanya berarti "slot env V2", bukan identitas
  // kunci — rotasi kedua (V2 diganti nilai baru) tidak bisa dibedakan dari
  // payload lama yang masih memakai V2 sebelumnya.
  return `${version}:${keyIdOf(key)}:${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

/** 8 hex pertama sha256(key) — penanda kunci, bukan rahasia. */
export function keyIdOf(key: Buffer): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 8);
}

/** Semua kunci yang dikenal proses ini: v1, v2, dan keyring env opsional. */
function knownKeys(): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  const v1 = (process.env.PAYMENT_ENCRYPTION_KEY ?? "").trim();
  if (/^[0-9a-fA-F]{64}$/.test(v1)) out.set(keyIdOf(keyBuffer(v1)), keyBuffer(v1));
  const v2 = (process.env.PAYMENT_ENCRYPTION_KEY_V2 ?? "").trim();
  if (/^[0-9a-fA-F]{64}$/.test(v2)) out.set(keyIdOf(keyBuffer(v2)), keyBuffer(v2));
  // PAYMENT_ENCRYPTION_KEYS="kid:hex,kid:hex" — kunci pensiun agar payload
  // lama tetap bisa dibaca/dirotasi setelah kunci diganti.
  for (const entry of (process.env.PAYMENT_ENCRYPTION_KEYS ?? "").split(",")) {
    const [kid, hex] = entry.split(":").map((part) => part.trim());
    if (kid && hex && /^[0-9a-fA-F]{64}$/.test(hex)) {
      out.set(kid.toLowerCase(), keyBuffer(hex));
    }
  }
  return out;
}

function decryptRaw(payload: string, key: Buffer): string {
  const parts = payload.split(":");
  const legacy = parts.length === 4;
  if (!legacy && parts.length !== 5) {
    throw new Error(
      `Payload enkripsi tidak dikenal (expected "v1|v2:[keyId:]iv:tag:cipher", got prefix "${parts[0] ?? ""}").`
    );
  }
  if (!SUPPORTED_VERSIONS.includes(parts[0] as Version)) {
    throw new Error(`Versi enkripsi tidak dikenal: ${parts[0] ?? ""}`);
  }
  const base = legacy ? 1 : 2;
  const iv = Buffer.from(parts[base]!, "hex");
  const tag = Buffer.from(parts[base + 1]!, "hex");
  const ciphertext = Buffer.from(parts[base + 2]!, "hex");
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

/** Decrypt `v1|v2:[keyId:]iv:tag:cipher` → plaintext. */
// NEVER log plaintext
export function decrypt(payload: string, keyHex?: string): string {
  const parts = payload.split(":");
  const version = parts[0] as Version;
  if (keyHex) return decryptRaw(payload, keyBuffer(keyHex));
  if (parts.length === 5) {
    const kid = (parts[1] ?? "").toLowerCase();
    const key = knownKeys().get(kid);
    if (!key) {
      throw new Error(
        `Kunci ${kid} tidak tersedia (set PAYMENT_ENCRYPTION_KEY_V2 atau daftarkan di PAYMENT_ENCRYPTION_KEYS).`
      );
    }
    return decryptRaw(payload, key);
  }
  return decryptRaw(payload, resolveDecryptKey(version));
}

/**
 * Re-encrypt payload ke kunci aktif. Idempotent berdasarkan KEY ID, bukan tag
 * versi: payload yang sudah memakai kunci aktif tidak disentuh walau V2 diganti
 * nilai baru. Payload yang tidak bisa didekripsi melempar error (bukan
 * dilaporkan sebagai "rotated: false").
 */
export function reEncrypt(payload: string): { rotated: boolean; payload: string } {
  const { version: targetVersion, key: targetKey } = resolveEncryptKey();
  const targetKid = keyIdOf(targetKey);
  const parts = payload.split(":");
  if (parts.length === 5 && parts[0] === targetVersion && parts[1]?.toLowerCase() === targetKid) {
    return { rotated: false, payload };
  }
  const plaintext = decrypt(payload);
  return { rotated: true, payload: encryptRaw(plaintext, targetVersion, targetKey) };
}
