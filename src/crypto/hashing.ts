import { createHash } from "node:crypto";
import { hash as argon2Hash, verify as argon2Verify } from "@node-rs/argon2";

// @node-rs/argon2 exports `Algorithm` as an ambient `const enum`, which
// isolatedModules (required by our esbuild-based tsx/build pipeline) forbids
// referencing directly. Argon2id's stable value is 2; this is documented in
// the package's own type definitions.
const ARGON2ID = 2;

/**
 * Password hashing (argon2id, per CLAUDE.md). Sessions are not hashed at
 * rest: the opaque session id is the row's primary key, sent only to our own
 * origin over httpOnly cookies. API keys ARE bearer credentials handed to
 * external machine callers and are hashed at rest (see hashApiKey below) --
 * a deliberate difference in trust model, not an inconsistency.
 */
export async function hashPassword(password: string): Promise<string> {
  return argon2Hash(password, { algorithm: ARGON2ID });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2Verify(hash, password);
}

/** sha256 hex digest, used to store API keys as a lookup-able hash, never the raw value. */
export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
