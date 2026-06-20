import type { FastifyRequest } from "fastify";
import { AppError } from "../contract/errors.js";
// Side-effect import: pulls in @fastify/cookie's FastifyRequest/FastifyReply
// augmentation (adds `.cookies`) so it's available everywhere this module's
// augmentation is.
import "@fastify/cookie";

/**
 * Populated by exactly one of the two auth preHandlers (sessionAuth or
 * apiKeyAuth) -- see requestContext's module augmentation below. Every route
 * handler must resolve tenantId through `requireTenantId`, which re-checks at
 * the point of use rather than trusting the preHandler ran: CLAUDE.md's "no
 * tenant context -> no data" is enforced here, not just assumed from route
 * wiring.
 */
declare module "fastify" {
  interface FastifyRequest {
    tenantId?: string;
    userId?: string;
    apiKeyId?: string;
  }
}

export function requireTenantId(request: FastifyRequest): string {
  if (!request.tenantId) {
    throw new AppError("UNAUTHENTICATED", "Authentication is required for this request.");
  }
  return request.tenantId;
}
