/**
 * Persistence-layer row types. These are internal (not API-boundary) types,
 * so plain interfaces are appropriate here -- the zod schemas in src/contract
 * are the only source of truth for what crosses the wire (see CLAUDE.md).
 */

import type { TicketSource } from "../contract/tickets.contract.js";
export type { TicketSource };

export interface Tenant {
  id: string;
  createdAt: string;
}

export interface User {
  id: string;
  tenantId: string;
  email: string;
  passwordHash: string;
  createdAt: string;
}

export interface Session {
  id: string;
  tenantId: string;
  userId: string;
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
}

export interface JiraCredential {
  id: string;
  tenantId: string;
  cloudId: string;
  siteUrl: string;
  accessTokenEncrypted: string;
  refreshTokenEncrypted: string;
  accessTokenExpiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export type ApiKeyId = string;

export interface ApiKey {
  id: ApiKeyId;
  tenantId: string;
  name: string;
  keyHash: string;
  keyPrefix: string;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
}

export interface Ticket {
  id: string;
  tenantId: string;
  jiraIssueKey: string;
  jiraIssueId: string;
  projectKey: string;
  title: string;
  source: TicketSource;
  createdAt: string;
}

/**
 * Repository interfaces -- the contracts services depend on. Implementations
 * live in this directory (backed by better-sqlite3); tests provide
 * in-memory fakes implementing the same interfaces, so services are
 * unit-testable with no real DB (see CLAUDE.md: "Services must be
 * unit-testable with no HTTP server and no real DB").
 *
 * Tenant scoping rule: every method that reads or writes tenant-owned data
 * takes a tenantId and scopes its query by it. The only exceptions are the
 * two credential-resolution entry points whose entire job is mapping an
 * opaque bearer credential to a tenant -- `findByEmail` (login) and
 * `SessionsRepository.findById` / `ApiKeysRepository.findByHash` (request
 * authentication) -- mirroring the API-key model in CLAUDE.md ("inbound key
 * -> tenant -> that tenant's Jira creds"). Every other call in a request
 * uses the tenantId resolved by one of those three. See DECISIONS.md.
 */

export interface TenantsRepository {
  create(input: { id: string; createdAt: string }): Tenant;
  findById(tenantId: string): Tenant | null;
}

export interface UsersRepository {
  create(input: { id: string; tenantId: string; email: string; passwordHash: string; createdAt: string }): User;
  /** Identity resolution only (login + registration uniqueness check). Not tenant-scoped by design. */
  findByEmail(email: string): User | null;
  findById(tenantId: string, userId: string): User | null;
}

export interface SessionsRepository {
  create(input: {
    id: string;
    tenantId: string;
    userId: string;
    createdAt: string;
    lastActiveAt: string;
    expiresAt: string;
  }): Session;
  /** Identity resolution only (cookie -> session -> tenant). Not tenant-scoped by design. */
  findById(sessionId: string): Session | null;
  touch(tenantId: string, sessionId: string, lastActiveAt: string, expiresAt: string): void;
  delete(tenantId: string, sessionId: string): void;
}

export interface JiraCredentialsRepository {
  upsert(input: {
    tenantId: string;
    cloudId: string;
    siteUrl: string;
    accessTokenEncrypted: string;
    refreshTokenEncrypted: string;
    accessTokenExpiresAt: string;
    now: string;
  }): void;
  findByTenant(tenantId: string): JiraCredential | null;
  updateTokens(
    tenantId: string,
    fields: { accessTokenEncrypted: string; refreshTokenEncrypted: string; accessTokenExpiresAt: string; now: string }
  ): void;
}

export interface ApiKeysRepository {
  create(input: {
    id: string;
    tenantId: string;
    name: string;
    keyHash: string;
    keyPrefix: string;
    createdAt: string;
    expiresAt: string | null;
  }): ApiKey;
  /** Identity resolution only (header -> key -> tenant). Not tenant-scoped by design. */
  findByHash(keyHash: string): ApiKey | null;
  listByTenant(tenantId: string): ApiKey[];
  findById(tenantId: string, keyId: ApiKeyId): ApiKey | null;
  revoke(tenantId: string, keyId: ApiKeyId, revokedAt: string): void;
  touchLastUsed(tenantId: string, keyId: ApiKeyId, lastUsedAt: string): void;
}

export interface TicketsRepository {
  create(input: {
    id: string;
    tenantId: string;
    jiraIssueKey: string;
    jiraIssueId: string;
    projectKey: string;
    title: string;
    source: TicketSource;
    createdAt: string;
  }): Ticket;
  listRecentByProject(tenantId: string, projectKey: string, limit: number): Ticket[];
}
