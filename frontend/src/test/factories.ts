/**
 * Typed factory helpers for test data. All shapes are derived from the frozen
 * contract schemas, so compile-time types and runtime shapes cannot drift.
 */
import type { z } from "zod";
import type { userResponseSchema, authResponseSchema } from "@contract/auth.contract";
import type {
  jiraProjectSchema,
  jiraStatusResponseSchema,
  jiraProjectsResponseSchema
} from "@contract/jira.contract";
import type {
  ticketResponseSchema,
  recentTicketsResponseSchema
} from "@contract/tickets.contract";
import type {
  apiKeySummarySchema,
  createApiKeyResponseSchema,
  listApiKeysResponseSchema
} from "@contract/apiKeys.contract";

type User = z.infer<typeof userResponseSchema>;
type AuthResponse = z.infer<typeof authResponseSchema>;
type JiraProject = z.infer<typeof jiraProjectSchema>;
type JiraStatus = z.infer<typeof jiraStatusResponseSchema>;
type JiraProjectsResponse = z.infer<typeof jiraProjectsResponseSchema>;
type Ticket = z.infer<typeof ticketResponseSchema>;
type RecentTicketsResponse = z.infer<typeof recentTicketsResponseSchema>;
type ApiKey = z.infer<typeof apiKeySummarySchema>;
type CreateApiKeyResponse = z.infer<typeof createApiKeyResponseSchema>;
type ListApiKeysResponse = z.infer<typeof listApiKeysResponseSchema>;

let _seq = 0;
function seq(): string {
  return String(++_seq);
}

export function makeUser(overrides?: Partial<User>): User {
  const n = seq();
  return {
    id: `user-${n}`,
    email: `user${n}@example.com`,
    createdAt: "2024-01-01T00:00:00.000Z",
    ...overrides
  };
}

export function makeAuthResponse(overrides?: Partial<AuthResponse>): AuthResponse {
  return {
    user: makeUser(),
    ...overrides
  };
}

export function makeProject(overrides?: Partial<JiraProject>): JiraProject {
  const n = seq();
  return {
    id: `proj-${n}`,
    key: `PROJ${n}`,
    name: `Project ${n}`,
    ...overrides
  };
}

export function makeJiraStatus(overrides?: Partial<JiraStatus>): JiraStatus {
  return {
    connected: false,
    ...overrides
  };
}

export function makeProjectsResponse(projects: JiraProject[]): JiraProjectsResponse {
  return { projects };
}

export function makeTicket(overrides?: Partial<Ticket>): Ticket {
  const n = seq();
  return {
    id: `ticket-${n}`,
    projectKey: "PROJ1",
    jiraIssueKey: `PROJ1-${n}`,
    title: `Test ticket ${n}`,
    source: "ui",
    createdAt: "2024-01-01T00:00:00.000Z",
    jiraIssueUrl: `https://example.atlassian.net/browse/PROJ1-${n}`,
    ...overrides
  };
}

export function makeRecentTicketsResponse(tickets: Ticket[]): RecentTicketsResponse {
  return { tickets };
}

export function makeApiKey(overrides?: Partial<ApiKey>): ApiKey {
  const n = seq();
  return {
    id: `key-${n}`,
    name: `scanner-${n}`,
    keyPrefix: `abc${n}`,
    createdAt: "2024-01-01T00:00:00.000Z",
    expiresAt: null,
    revokedAt: null,
    lastUsedAt: null,
    ...overrides
  };
}

export function makeListApiKeysResponse(keys: ApiKey[]): ListApiKeysResponse {
  return { apiKeys: keys };
}

export function makeCreateApiKeyResponse(
  secret: string,
  keyOverrides?: Partial<ApiKey>
): CreateApiKeyResponse {
  return {
    apiKey: makeApiKey(keyOverrides),
    secret
  };
}
