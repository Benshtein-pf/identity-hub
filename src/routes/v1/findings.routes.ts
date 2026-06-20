import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createFindingRequestSchema, createFindingResponseSchema } from "../../contract/findings.contract.js";
import { apiKeyRateLimitKeyGenerator, createApiKeyAuthHandler } from "../../plugins/apiKeyAuth.js";
import { requireTenantId } from "../../plugins/requestContext.js";
import type { ApiKeysService } from "../../services/apiKeys.service.js";
import type { TicketsService } from "../../services/tickets.service.js";

export interface FindingsRoutesOptions {
  ticketsService: TicketsService;
  apiKeysService: ApiKeysService;
  rateLimitMax: number;
  rateLimitWindowMs: number;
}

/**
 * The external REST API (deliverable 7): scanners/CI pipelines report NHI
 * findings here. Auth is per-API-key (not session cookies); rate limiting is
 * per-key (see apiKeyRateLimitKeyGenerator), not global, so one noisy
 * integration cannot starve another tenant's key.
 */
export function registerFindingsRoutes(fastify: FastifyInstance, options: FindingsRoutesOptions): void {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const requireApiKey = createApiKeyAuthHandler(options.apiKeysService);

  app.route({
    method: "POST",
    url: "/api/v1/findings",
    schema: {
      body: createFindingRequestSchema,
      response: { 201: createFindingResponseSchema }
    },
    preHandler: requireApiKey,
    config: {
      rateLimit: {
        max: options.rateLimitMax,
        timeWindow: options.rateLimitWindowMs,
        keyGenerator: apiKeyRateLimitKeyGenerator
      }
    },
    handler: async (request, reply) => {
      const tenantId = requireTenantId(request);
      const ticket = await options.ticketsService.createTicket(tenantId, request.body, "api");
      reply.code(201).send(ticket);
    }
  });
}
