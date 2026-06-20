import { describe, expect, it } from "vitest";
import { decryptFromString, encryptToString, InvalidEncryptionKeyError, validateEncryptionKey } from "../../src/crypto/encryption.js";

const KEY = Buffer.alloc(32, 9);

describe("encryption", () => {
  it("round-trips plaintext through encrypt/decrypt", () => {
    const packed = encryptToString("super secret refresh token", KEY);
    expect(decryptFromString(packed, KEY)).toBe("super secret refresh token");
  });

  it("never stores the plaintext in the packed string", () => {
    const packed = encryptToString("super secret refresh token", KEY);
    expect(packed).not.toContain("super secret refresh token");
  });

  it("uses a fresh IV each call, so identical plaintext encrypts differently", () => {
    const first = encryptToString("same value", KEY);
    const second = encryptToString("same value", KEY);
    expect(first).not.toBe(second);
  });

  it("rejects a tampered ciphertext (authenticated encryption catches it)", () => {
    const packed = encryptToString("super secret refresh token", KEY);
    const parts = packed.split(".");
    const ciphertext = parts[2] ?? "";
    // Flip the first character rather than appending: base64's decoder stops
    // at the first "=" padding char, so appending garbage after it would
    // silently be ignored rather than actually corrupting the decoded bytes.
    const flipped = ciphertext.startsWith("A") ? `B${ciphertext.slice(1)}` : `A${ciphertext.slice(1)}`;
    const tampered = [parts[0], parts[1], flipped].join(".");
    expect(() => decryptFromString(tampered, KEY)).toThrow();
  });

  it("rejects decryption with the wrong key", () => {
    const packed = encryptToString("super secret refresh token", KEY);
    const wrongKey = Buffer.alloc(32, 1);
    expect(() => decryptFromString(packed, wrongKey)).toThrow();
  });

  it("rejects a malformed packed string", () => {
    expect(() => decryptFromString("not-the-right-shape", KEY)).toThrow();
  });

  it("validateEncryptionKey accepts a base64-encoded 32-byte key", () => {
    const key = validateEncryptionKey(KEY.toString("base64"));
    expect(key.byteLength).toBe(32);
  });

  it("validateEncryptionKey rejects a key of the wrong length", () => {
    const tooShort = Buffer.alloc(16, 1).toString("base64");
    expect(() => validateEncryptionKey(tooShort)).toThrow(InvalidEncryptionKeyError);
  });
});
