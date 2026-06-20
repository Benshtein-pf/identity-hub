import { randomBytes, randomUUID } from "node:crypto";

/** Cryptographically random, URL-safe opaque token (session ids, API key secrets). */
export function generateOpaqueToken(byteLength = 32): string {
  return randomBytes(byteLength).toString("base64url");
}

/** Random id for rows where we just need a unique, non-guessable primary key. */
export function generateId(): string {
  return randomUUID();
}

/** OAuth `state` value: random and single-use, never reused across requests. */
export function generateOAuthState(): string {
  return randomBytes(32).toString("base64url");
}
