import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  apiKeyIdParamSchema,
  createApiKeyRequestSchema,
  createApiKeyResponseSchema,
  listApiKeysResponseSchema
} from "../contract/apiKeys.contract.js";
import { requireTenantId } from "../plugins/requestContext.js";
import type { ApiKeysService } from "../services/apiKeys.service.js";

export interface ApiKeysRoutesOptions {
  apiKeysService: ApiKeysService;
  requireSession: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
}

export function registerApiKeysRoutes(fastify: FastifyInstance, options: ApiKeysRoutesOptions): void {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.route({
    method: "POST",
    url: "/api/api-keys",
    schema: {
      body: createApiKeyRequestSchema,
      response: { 201: createApiKeyResponseSchema }
    },
    preHandler: options.requireSession,
    handler: async (request, reply) => {
      const tenantId = requireTenantId(request);
      const result = options.apiKeysService.createApiKey(tenantId, request.body);
      reply.code(201).send(result);
    }
  });

  app.route({
    method: "GET",
    url: "/api/api-keys",
    schema: { response: { 200: listApiKeysResponseSchema } },
    preHandler: options.requireSession,
    handler: async (request, reply) => {
      const tenantId = requireTenantId(request);
      const apiKeys = options.apiKeysService.listApiKeys(tenantId);
      reply.code(200).send({ apiKeys });
    }
  });

  app.route({
    method: "DELETE",
    url: "/api/api-keys/:id",
    schema: { params: apiKeyIdParamSchema },
    preHandler: options.requireSession,
    handler: async (request, reply) => {
      const tenantId = requireTenantId(request);
      options.apiKeysService.revokeApiKey(tenantId, request.params.id);
      reply.code(204).send();
    }
  });
}
