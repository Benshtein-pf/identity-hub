/**
 * One typed function per API route, derived from the frozen contract schemas.
 * Response bodies are parsed by the matching zod schema in apiFetch, so
 * compile-time types and runtime shapes cannot drift.
 */
import { z } from "zod";
import { authResponseSchema } from "@contract/auth.contract";
import { jiraStatusResponseSchema, jiraProjectsResponseSchema } from "@contract/jira.contract";
import {
  ticketResponseSchema,
  recentTicketsResponseSchema
} from "@contract/tickets.contract";
import {
  createApiKeyResponseSchema,
  listApiKeysResponseSchema
} from "@contract/apiKeys.contract";
import { apiFetch } from "./client";
import { API_BASE } from "./config";

// Auth

export function getMe() {
  return apiFetch("/api/auth/me", authResponseSchema);
}

export function register(email: string, password: string) {
  return apiFetch("/api/auth/register", authResponseSchema, {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
}

export function login(email: string, password: string) {
  return apiFetch("/api/auth/login", authResponseSchema, {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
}

export function logout() {
  return apiFetch("/api/auth/logout", z.void(), { method: "POST" });
}

// Jira

export function getJiraStatus() {
  return apiFetch("/api/jira/status", jiraStatusResponseSchema);
}

export function getJiraProjects() {
  return apiFetch("/api/jira/projects", jiraProjectsResponseSchema);
}

/**
 * Initiates the Jira OAuth 2.0 (3LO) flow by navigating the browser directly
 * to the backend connect endpoint. This is a full navigation — not a fetch —
 * so the backend's 302 redirect to Atlassian is followed by the browser.
 * The session cookie is sent because this is a same-site navigation to localhost.
 */
export function startJiraConnect(): void {
  window.location.href = `${API_BASE}/api/jira/connect`;
}

// Tickets

export interface CreateTicketInput {
  projectKey: string;
  title: string;
  description?: string;
}

export function createTicket(input: CreateTicketInput) {
  return apiFetch("/api/tickets", ticketResponseSchema, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function getRecentTickets(projectKey: string) {
  return apiFetch(
    `/api/tickets?projectKey=${encodeURIComponent(projectKey)}`,
    recentTicketsResponseSchema
  );
}

// API keys

export interface CreateApiKeyInput {
  name?: string;
  expiresAt?: string;
}

export function createApiKey(input: CreateApiKeyInput) {
  return apiFetch("/api/api-keys", createApiKeyResponseSchema, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function listApiKeys() {
  return apiFetch("/api/api-keys", listApiKeysResponseSchema);
}

export function deleteApiKey(id: string) {
  return apiFetch(`/api/api-keys/${encodeURIComponent(id)}`, z.void(), {
    method: "DELETE"
  });
}
