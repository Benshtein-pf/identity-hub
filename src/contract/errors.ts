import { z } from "zod";

/**
 * The single structured error body for every route in this app (REST API and
 * UI-facing routes alike). `code` is a stable, machine-checkable string the
 * frontend and external API consumers can branch on; `message` is the
 * human-readable, actionable text shown to a person. Never put secrets,
 * stack traces, or raw upstream error payloads into either field.
 *
 * Status-code contract (cross-cutting, applies everywhere unless a route
 * doc says otherwise):
 *   400 VALIDATION_ERROR        body/query failed its zod schema, or had unknown fields
 *   401 UNAUTHENTICATED         missing/invalid session cookie or API key
 *   401 INVALID_CREDENTIALS     login email/password did not match
 *   404 NOT_FOUND               unknown route, or a resource scoped to the
 *                               caller's tenant that does not exist there
 *   409 EMAIL_TAKEN             register with an email already in use
 *   409 JIRA_NOT_CONNECTED      action needs a connected Jira workspace and there isn't one
 *   422 PROJECT_NOT_FOUND       ticket creation referenced a project the
 *                               connected Jira workspace doesn't have. This is
 *                               deliberately 422, not 404: the request body is
 *                               syntactically valid (400 territory) and the
 *                               route exists (404 territory) -- the *value* of
 *                               one field is semantically unprocessable. 404 is
 *                               reserved for "no such route/resource".
 *   400 INVALID_OAUTH_STATE     OAuth callback state missing, unknown, or already consumed
 *   429 RATE_LIMITED            per-API-key rate limit exceeded
 *   502 JIRA_UPSTREAM_ERROR     Jira returned an error or was unreachable
 *   500 INTERNAL_ERROR          unexpected server error
 */
export const ERROR_CODES = [
  "VALIDATION_ERROR",
  "UNAUTHENTICATED",
  "INVALID_CREDENTIALS",
  "EMAIL_TAKEN",
  "NOT_FOUND",
  "JIRA_NOT_CONNECTED",
  "PROJECT_NOT_FOUND",
  "INVALID_OAUTH_STATE",
  "API_KEY_REVOKED",
  "API_KEY_EXPIRED",
  "RATE_LIMITED",
  "JIRA_UPSTREAM_ERROR",
  "INTERNAL_ERROR"
] as const;

export const errorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const errorResponseSchema = z
  .object({
    error: z
      .object({
        code: errorCodeSchema,
        message: z.string(),
        details: z.unknown().optional()
      })
      .strict()
  })
  .strict();
export type ErrorResponse = z.infer<typeof errorResponseSchema>;

/** Maps each error code to its HTTP status. Single source of truth, used by the error-handling plugin. */
export const ERROR_CODE_STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  INVALID_CREDENTIALS: 401,
  EMAIL_TAKEN: 409,
  NOT_FOUND: 404,
  JIRA_NOT_CONNECTED: 409,
  PROJECT_NOT_FOUND: 422,
  INVALID_OAUTH_STATE: 400,
  API_KEY_REVOKED: 401,
  API_KEY_EXPIRED: 401,
  RATE_LIMITED: 429,
  JIRA_UPSTREAM_ERROR: 502,
  INTERNAL_ERROR: 500
};

/** Thrown by services/plugins; the error-handler plugin maps this to the structured response above. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.details = details;
  }
}
