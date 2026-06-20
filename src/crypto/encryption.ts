import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM at-rest encryption for secrets (Jira OAuth tokens). Per
 * CLAUDE.md: 32-byte key from APP_ENCRYPTION_KEY (base64), a fresh random
 * 12-byte IV per encryption, IV + auth tag stored alongside the ciphertext.
 * Decrypt only ever happens at the point of use; callers must never log the
 * plaintext or the key.
 */
const ALGORITHM = "aes-256-gcm";
const KEY_BYTE_LENGTH = 32;
const IV_BYTE_LENGTH = 12;

export class InvalidEncryptionKeyError extends Error {}
export class DecryptionFailedError extends Error {
  constructor() {
    // Never include the underlying cause: it may echo ciphertext/key material.
    super("Failed to decrypt value: data is corrupt or the encryption key changed.");
  }
}

/** Throws InvalidEncryptionKeyError if `value` is not base64 for exactly 32 bytes. */
export function validateEncryptionKey(value: string): Buffer {
  let key: Buffer;
  try {
    key = Buffer.from(value, "base64");
  } catch {
    throw new InvalidEncryptionKeyError("APP_ENCRYPTION_KEY must be valid base64.");
  }
  if (key.byteLength !== KEY_BYTE_LENGTH) {
    throw new InvalidEncryptionKeyError(
      `APP_ENCRYPTION_KEY must decode to ${KEY_BYTE_LENGTH} bytes, got ${key.byteLength}. ` +
        `Generate one with "npm run gen:key".`
    );
  }
  return key;
}

/**
 * Encrypts `plaintext` and returns a single opaque string safe to store in one
 * DB column: base64(iv) + "." + base64(authTag) + "." + base64(ciphertext).
 */
export function encryptToString(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTE_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(".");
}

/** Reverses encryptToString. Throws DecryptionFailedError on any tamper/format issue. */
export function decryptFromString(packed: string, key: Buffer): string {
  const parts = packed.split(".");
  if (parts.length !== 3) {
    throw new DecryptionFailedError();
  }
  const ivPart = parts[0];
  const authTagPart = parts[1];
  const ciphertextPart = parts[2];
  if (ivPart === undefined || authTagPart === undefined || ciphertextPart === undefined) {
    throw new DecryptionFailedError();
  }
  try {
    const iv = Buffer.from(ivPart, "base64");
    const authTag = Buffer.from(authTagPart, "base64");
    const ciphertext = Buffer.from(ciphertextPart, "base64");
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString("utf8");
  } catch {
    throw new DecryptionFailedError();
  }
}
