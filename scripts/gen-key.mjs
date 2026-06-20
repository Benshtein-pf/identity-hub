import { randomBytes } from "node:crypto";

// Prints a base64-encoded 32-byte key suitable for APP_ENCRYPTION_KEY.
console.log(randomBytes(32).toString("base64"));
