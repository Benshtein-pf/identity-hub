import type { TicketResponse } from "../contract/tickets.contract.js";
import { AppError } from "../contract/errors.js";
import { generateId } from "../crypto/tokens.js";
import type { JiraClient } from "../integrations/jira/jiraClient.js";
import type { Ticket, TicketsRepository, TicketSource } from "../repositories/types.js";
import type { JiraService } from "./jira.service.js";
import type { JiraOAuthService } from "./jiraOAuth.service.js";
import { systemClock, type Clock } from "./shared/clock.js";
import { withJiraErrorMapping } from "./shared/jiraErrorMapping.js";

const DEFAULT_ISSUE_TYPE = "Task";
const RECENT_TICKETS_LIMIT = 10;

export interface CreateTicketInput {
  projectKey: string;
  title: string;
  description?: string;
  issueType?: string;
}

export interface TicketsServiceConfig {
  tickets: TicketsRepository;
  jiraClient: JiraClient;
  jiraService: JiraService;
  jiraOAuth: JiraOAuthService;
  clock?: Clock;
}

export interface TicketsService {
  createTicket(tenantId: string, input: CreateTicketInput, source: TicketSource): Promise<TicketResponse>;
  listRecentTickets(tenantId: string, projectKey: string): Promise<TicketResponse[]>;
}

export function createTicketsService(config: TicketsServiceConfig): TicketsService {
  const clock = config.clock ?? systemClock;

  function toTicketResponse(ticket: Ticket, siteUrl: string): TicketResponse {
    return {
      id: ticket.id,
      projectKey: ticket.projectKey,
      jiraIssueKey: ticket.jiraIssueKey,
      title: ticket.title,
      source: ticket.source,
      createdAt: ticket.createdAt,
      jiraIssueUrl: `${siteUrl}/browse/${ticket.jiraIssueKey}`
    };
  }

  return {
    async createTicket(tenantId, input, source) {
      // Validates the project against the connected workspace up front, so
      // an unknown project key is reported as 422 PROJECT_NOT_FOUND rather
      // than relying on Jira's create-issue error body (whose shape for that
      // case is not something we want this app's behavior to depend on).
      const project = await config.jiraService.resolveProject(tenantId, input.projectKey);
      const { accessToken, cloudId, siteUrl } = await config.jiraOAuth.getValidAccessToken(tenantId);

      const created = await withJiraErrorMapping(() =>
        config.jiraClient.createIssue(accessToken, cloudId, {
          projectKey: project.key,
          summary: input.title,
          issueType: input.issueType ?? DEFAULT_ISSUE_TYPE,
          ...(input.description !== undefined ? { description: input.description } : {})
        })
      );

      const ticket = config.tickets.create({
        id: generateId(),
        tenantId,
        jiraIssueKey: created.key,
        jiraIssueId: created.id,
        projectKey: project.key,
        title: input.title,
        source,
        createdAt: clock().toISOString()
      });

      return toTicketResponse(ticket, siteUrl);
    },

    async listRecentTickets(tenantId, projectKey) {
      const status = config.jiraOAuth.getStatus(tenantId);
      const siteUrl = status.siteUrl;
      if (!status.connected || !siteUrl) {
        throw new AppError("JIRA_NOT_CONNECTED", "Connect your Jira workspace before viewing tickets.");
      }
      const normalizedKey = projectKey.trim().toUpperCase();
      const tickets = config.tickets.listRecentByProject(tenantId, normalizedKey, RECENT_TICKETS_LIMIT);
      return tickets.map((ticket) => toTicketResponse(ticket, siteUrl));
    }
  };
}
