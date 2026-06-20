import "dotenv/config";
import { z } from "zod";
import { validateEncryptionKey } from "../crypto/encryption.js";

/**
 * All process.env access in the app goes through this module. Parsed once at
 * boot; on failure we print a clear message (no secret values) and exit
 * rather than letting a misconfigured deploy start serving traffic.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),

  // Public origin of this API (used to build the OAuth redirect_uri default)
  // and the origin the browser is redirected back to after the Jira OAuth
  // callback completes (the frontend app).
  APP_BASE_URL: z.string().url(),
  FRONTEND_URL: z.string().url(),

  DATABASE_PATH: z.string().min(1).default("./data/identity-hub.sqlite"),

  // base64-encoded 32-byte (256-bit) key for AES-256-GCM, see crypto/encryption.ts
  APP_ENCRYPTION_KEY: z.string().min(1).superRefine((value, ctx) => {
    try {
      validateEncryptionKey(value);
    } catch (error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: error instanceof Error ? error.message : "Invalid APP_ENCRYPTION_KEY"
      });
    }
  }),

  ATLASSIAN_CLIENT_ID: z.string().min(1),
  ATLASSIAN_CLIENT_SECRET: z.string().min(1),
  ATLASSIAN_REDIRECT_URI: z.string().url(),

  SESSION_COOKIE_NAME: z.string().min(1).default("ih_session"),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(7),

  API_KEY_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
  API_KEY_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000)
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    // eslint-disable-next-line no-console
    console.error(`Invalid environment configuration:\n${issues}\n\nCheck your .env against .env.example.`);
    process.exit(1);
  }
  return result.data;
}

export const env = loadEnv();
