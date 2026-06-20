import type { CreateTicketRequest, TicketResponse } from "./tickets.contract.js";
import { createTicketRequestSchema, ticketResponseSchema } from "./tickets.contract.js";

/**
 * Route covered:
 *   POST /api/v1/findings -> 201 createFindingResponseSchema
 *                            401 UNAUTHENTICATED (missing/invalid/revoked/expired API key)
 *                            400 VALIDATION_ERROR (bad body / unknown fields)
 *                            409 JIRA_NOT_CONNECTED (this tenant hasn't connected Jira)
 *                            422 PROJECT_NOT_FOUND
 *                            429 RATE_LIMITED
 *                            502 JIRA_UPSTREAM_ERROR
 *
 * Deliberately the same schema as the UI ticket-creation route
 * (createTicketRequestSchema / ticketResponseSchema in tickets.contract.ts):
 * a finding reported by a scanner and a ticket filed from the UI are the same
 * kind of record (see DECISIONS.md), so this module aliases rather than
 * redefines them to keep the two from drifting apart.
 */
export const createFindingRequestSchema = createTicketRequestSchema;
export type CreateFindingRequest = CreateTicketRequest;

export const createFindingResponseSchema = ticketResponseSchema;
export type CreateFindingResponse = TicketResponse;
