import { z } from "zod";

/**
 * Routes covered:
 *   POST /api/tickets               -> 201 ticketResponseSchema
 *                                      401 UNAUTHENTICATED, 409 JIRA_NOT_CONNECTED,
 *                                      422 PROJECT_NOT_FOUND, 502 JIRA_UPSTREAM_ERROR
 *   GET  /api/tickets?projectKey=.. -> 200 recentTicketsResponseSchema (<=10, newest first)
 *                                      401 UNAUTHENTICATED, 409 JIRA_NOT_CONNECTED
 *
 * `createTicketRequestSchema` / `ticketResponseSchema` are also the request/
 * response shapes for the external REST API (POST /api/v1/findings, see
 * findings.contract.ts) -- per DECISIONS.md, a ticket created via the UI and
 * one created via the REST API are the same kind of record, so they share one
 * schema rather than two that could drift.
 */

export const ticketSourceSchema = z.enum(["ui", "api"]);
export type TicketSource = z.infer<typeof ticketSourceSchema>;

export const createTicketRequestSchema = z
  .object({
    projectKey: z.string().min(1).max(64),
    title: z.string().min(1).max(255),
    description: z.string().max(32_000).optional(),
    // Defaults to "Task" if omitted (documented assumption: the create-ticket
    // form only collects summary + description; see DECISIONS.md).
    issueType: z.string().min(1).max(64).optional()
  })
  .strict();
export type CreateTicketRequest = z.infer<typeof createTicketRequestSchema>;

export const ticketResponseSchema = z
  .object({
    id: z.string(),
    projectKey: z.string(),
    jiraIssueKey: z.string(),
    title: z.string(),
    source: ticketSourceSchema,
    createdAt: z.string(),
    jiraIssueUrl: z.string().url()
  })
  .strict();
export type TicketResponse = z.infer<typeof ticketResponseSchema>;

export const listRecentTicketsQuerySchema = z
  .object({
    projectKey: z.string().min(1).max(64)
  })
  .strict();
export type ListRecentTicketsQuery = z.infer<typeof listRecentTicketsQuerySchema>;

export const recentTicketsResponseSchema = z
  .object({
    tickets: z.array(ticketResponseSchema)
  })
  .strict();
export type RecentTicketsResponse = z.infer<typeof recentTicketsResponseSchema>;
