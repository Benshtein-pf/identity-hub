import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { jiraCallbackQuerySchema, jiraProjectsResponseSchema, jiraStatusResponseSchema } from "../contract/jira.contract.js";
import { AppError } from "../contract/errors.js";
import { requireTenantId } from "../plugins/requestContext.js";
import type { JiraOAuthService } from "../services/jiraOAuth.service.js";
import type { JiraService } from "../services/jira.service.js";

export interface JiraRoutesOptions {
  jiraOAuthService: JiraOAuthService;
  jiraService: JiraService;
  frontendUrl: string;
  requireSession: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
}

function errorReasonFromUnknown(error: unknown): string {
  return error instanceof AppError ? error.code : "INTERNAL_ERROR";
}

export function registerJiraRoutes(fastify: FastifyInstance, options: JiraRoutesOptions): void {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.route({
    method: "GET",
    url: "/api/jira/connect",
    preHandler: options.requireSession,
    handler: async (request, reply) => {
      const tenantId = requireTenantId(request);
      const authorizeUrl = options.jiraOAuthService.connect(tenantId);
      reply.redirect(authorizeUrl, 302);
    }
  });

  app.route({
    method: "GET",
    url: "/api/jira/callback",
    schema: {
      querystring: jiraCallbackQuerySchema
    },
    // Browser-driven: Atlassian redirects the user's browser here directly,
    // so there is no JSON caller to hand an error body to. Every outcome
    // (success or failure) ends in a redirect back to the frontend, never a
    // thrown error -- see contract/jira.contract.ts.
    handler: async (request, reply) => {
      const target = new URL("/jira/connected", options.frontendUrl);
      try {
        await options.jiraOAuthService.handleCallback({
          state: request.query.state,
          code: request.query.code,
          error: request.query.error
        });
        target.searchParams.set("status", "success");
      } catch (error) {
        target.searchParams.set("status", "error");
        target.searchParams.set("reason", errorReasonFromUnknown(error));
      }
      reply.redirect(target.toString(), 302);
    }
  });

  app.route({
    method: "GET",
    url: "/api/jira/status",
    schema: { response: { 200: jiraStatusResponseSchema } },
    preHandler: options.requireSession,
    handler: async (request, reply) => {
      const tenantId = requireTenantId(request);
      const status = options.jiraOAuthService.getStatus(tenantId);
      reply.code(200).send(status);
    }
  });

  app.route({
    method: "GET",
    url: "/api/jira/projects",
    schema: { response: { 200: jiraProjectsResponseSchema } },
    preHandler: options.requireSession,
    handler: async (request, reply) => {
      const tenantId = requireTenantId(request);
      const projects = await options.jiraService.listProjects(tenantId);
      reply.code(200).send({ projects });
    }
  });
}
