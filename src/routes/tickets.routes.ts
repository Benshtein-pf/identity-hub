import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  createTicketRequestSchema,
  listRecentTicketsQuerySchema,
  recentTicketsResponseSchema,
  ticketResponseSchema
} from "../contract/index.js";
import { requireTenantId } from "../plugins/requestContext.js";
import type { TicketsService } from "../services/index.js";

export interface TicketsRoutesOptions {
  ticketsService: TicketsService;
  requireSession: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
}

export function registerTicketsRoutes(fastify: FastifyInstance, options: TicketsRoutesOptions): void {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.route({
    method: "POST",
    url: "/api/tickets",
    schema: {
      body: createTicketRequestSchema,
      response: { 201: ticketResponseSchema }
    },
    preHandler: options.requireSession,
    handler: async (request, reply) => {
      const tenantId = requireTenantId(request);
      const ticket = await options.ticketsService.createTicket(tenantId, request.body, "ui");
      reply.code(201).send(ticket);
    }
  });

  app.route({
    method: "GET",
    url: "/api/tickets",
    schema: {
      querystring: listRecentTicketsQuerySchema,
      response: { 200: recentTicketsResponseSchema }
    },
    preHandler: options.requireSession,
    handler: async (request, reply) => {
      const tenantId = requireTenantId(request);
      const tickets = await options.ticketsService.listRecentTickets(tenantId, request.query.projectKey);
      reply.code(200).send({ tickets });
    }
  });
}
