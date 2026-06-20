import { z } from "zod";

/**
 * Routes covered:
 *   POST   /api/api-keys     -> 201 createApiKeyResponseSchema (raw secret shown exactly once)
 *                               401 UNAUTHENTICATED
 *   GET    /api/api-keys     -> 200 listApiKeysResponseSchema (no raw secrets, ever)
 *                               401 UNAUTHENTICATED
 *   DELETE /api/api-keys/:id -> 204 (no body)
 *                               401 UNAUTHENTICATED, 404 NOT_FOUND (not this tenant's key)
 */

export const createApiKeyRequestSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    // Optional user-set expiry. No forced default expiry: revocation, not
    // rotation, is the control for machine consumers (see DECISIONS.md).
    expiresAt: z
      .string()
      .datetime()
      .refine((v) => new Date(v) > new Date(), { message: "expiresAt must be a future date" })
      .optional()
  })
  .strict();
export type CreateApiKeyRequest = z.infer<typeof createApiKeyRequestSchema>;

export const apiKeySummarySchema = z
  .object({
    id: z.string(),
    name: z.string(),
    keyPrefix: z.string(),
    createdAt: z.string(),
    expiresAt: z.string().nullable(),
    revokedAt: z.string().nullable(),
    lastUsedAt: z.string().nullable()
  })
  .strict();
export type ApiKeySummary = z.infer<typeof apiKeySummarySchema>;

export const createApiKeyResponseSchema = z
  .object({
    apiKey: apiKeySummarySchema,
    secret: z.string()
  })
  .strict();
export type CreateApiKeyResponse = z.infer<typeof createApiKeyResponseSchema>;

export const listApiKeysResponseSchema = z
  .object({
    apiKeys: z.array(apiKeySummarySchema)
  })
  .strict();
export type ListApiKeysResponse = z.infer<typeof listApiKeysResponseSchema>;

export const apiKeyIdParamSchema = z
  .object({
    id: z.string().min(1)
  })
  .strict();
export type ApiKeyIdParam = z.infer<typeof apiKeyIdParamSchema>;
