import type { FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "../contract/errors.js";
import type { AuthService } from "../services/auth.service.js";
import "./requestContext.js";

/**
 * Cookie -> session -> tenant resolution (the credential-resolution step
 * described in repositories/types.ts). Attach as a `preHandler` on routes
 * that require a signed-in user; it populates request.tenantId/userId or
 * throws AppError("UNAUTHENTICATED", ...), which the error-handler plugin
 * turns into a 401.
 */
export function createSessionAuthHandler(authService: AuthService, cookieName: string) {
  return async function requireSession(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const sessionId = request.cookies[cookieName];
    if (!sessionId) {
      throw new AppError("UNAUTHENTICATED", "Sign in to continue.");
    }
    const result = authService.validateSession(sessionId);
    if (!result) {
      throw new AppError("UNAUTHENTICATED", "Your session has expired. Please sign in again.");
    }
    request.tenantId = result.user.tenantId;
    request.userId = result.user.id;
  };
}
