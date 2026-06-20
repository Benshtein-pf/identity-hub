import { z } from "zod";

/**
 * Routes covered:
 *   POST /api/auth/register  -> 201 authResponseSchema (also sets the session cookie; register auto-logs-in)
 *                                409 EMAIL_TAKEN
 *   POST /api/auth/login     -> 200 authResponseSchema (+ Set-Cookie)
 *                                401 INVALID_CREDENTIALS
 *   POST /api/auth/logout    -> 204 (no body)
 *   GET  /api/auth/me        -> 200 authResponseSchema
 *                                401 UNAUTHENTICATED
 */

export const registerRequestSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(8).max(256)
  })
  .strict();
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const loginRequestSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(1).max(256)
  })
  .strict();
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const userResponseSchema = z
  .object({
    id: z.string(),
    email: z.string().email(),
    createdAt: z.string()
  })
  .strict();
export type UserResponse = z.infer<typeof userResponseSchema>;

export const authResponseSchema = z
  .object({
    user: userResponseSchema
  })
  .strict();
export type AuthResponse = z.infer<typeof authResponseSchema>;
