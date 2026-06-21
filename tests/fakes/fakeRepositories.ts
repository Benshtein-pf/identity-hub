import type {
  ApiKey,
  ApiKeysRepository,
  JiraCredential,
  JiraCredentialsRepository,
  Session,
  SessionsRepository,
  Tenant,
  TenantsRepository,
  Ticket,
  TicketsRepository,
  User,
  UsersRepository
} from "../../src/repositories/types.js";

/**
 * In-memory fakes implementing the same repository interfaces the real
 * better-sqlite3-backed repositories do. Used to unit-test the service layer
 * with no real DB, per CLAUDE.md ("Services must be unit-testable with no
 * HTTP server and no real DB").
 */

export function createFakeUsersRepository(sharedRows?: Map<string, User>): UsersRepository {
  const rows = sharedRows ?? new Map<string, User>();
  return {
    create(input) {
      const user: User = { ...input };
      rows.set(user.id, user);
      return user;
    },
    findByEmail(email) {
      for (const user of rows.values()) {
        if (user.email === email) {
          return user;
        }
      }
      return null;
    },
    findById(tenantId, userId) {
      const user = rows.get(userId);
      return user && user.tenantId === tenantId ? user : null;
    }
  };
}

export function createFakeTenantsRepository(sharedUsersRows?: Map<string, User>): TenantsRepository {
  const rows = new Map<string, Tenant>();
  const usersRows = sharedUsersRows ?? new Map<string, User>();
  return {
    create(input) {
      const tenant: Tenant = { id: input.id, createdAt: input.createdAt };
      rows.set(tenant.id, tenant);
      return tenant;
    },
    findById(tenantId) {
      return rows.get(tenantId) ?? null;
    },
    createWithFirstUser(input) {
      const tenant: Tenant = { id: input.tenant.id, createdAt: input.tenant.createdAt };
      rows.set(tenant.id, tenant);
      const user: User = { ...input.user };
      usersRows.set(user.id, user);
      return { tenant, user };
    }
  };
}

export function createFakeSessionsRepository(): SessionsRepository {
  const rows = new Map<string, Session>();
  return {
    create(input) {
      const session: Session = { ...input };
      rows.set(session.id, session);
      return session;
    },
    findById(sessionId) {
      return rows.get(sessionId) ?? null;
    },
    touch(tenantId, sessionId, lastActiveAt, expiresAt) {
      const session = rows.get(sessionId);
      if (session && session.tenantId === tenantId) {
        rows.set(sessionId, { ...session, lastActiveAt, expiresAt });
      }
    },
    delete(tenantId, sessionId) {
      const session = rows.get(sessionId);
      if (session && session.tenantId === tenantId) {
        rows.delete(sessionId);
      }
    }
  };
}

export function createFakeJiraCredentialsRepository(): JiraCredentialsRepository {
  const rows = new Map<string, JiraCredential>();
  let counter = 0;
  return {
    upsert(input) {
      const existing = rows.get(input.tenantId);
      const credential: JiraCredential = {
        id: existing?.id ?? `fake-cred-${++counter}`,
        tenantId: input.tenantId,
        cloudId: input.cloudId,
        siteUrl: input.siteUrl,
        accessTokenEncrypted: input.accessTokenEncrypted,
        refreshTokenEncrypted: input.refreshTokenEncrypted,
        accessTokenExpiresAt: input.accessTokenExpiresAt,
        createdAt: existing?.createdAt ?? input.now,
        updatedAt: input.now
      };
      rows.set(input.tenantId, credential);
    },
    findByTenant(tenantId) {
      return rows.get(tenantId) ?? null;
    },
    updateTokens(tenantId, fields) {
      const existing = rows.get(tenantId);
      if (!existing) {
        return;
      }
      rows.set(tenantId, {
        ...existing,
        accessTokenEncrypted: fields.accessTokenEncrypted,
        refreshTokenEncrypted: fields.refreshTokenEncrypted,
        accessTokenExpiresAt: fields.accessTokenExpiresAt,
        updatedAt: fields.now
      });
    }
  };
}

export function createFakeApiKeysRepository(): ApiKeysRepository {
  const rows = new Map<string, ApiKey>();
  return {
    create(input) {
      const apiKey: ApiKey = { ...input, revokedAt: null, lastUsedAt: null };
      rows.set(apiKey.id, apiKey);
      return apiKey;
    },
    findByHash(keyHash) {
      for (const key of rows.values()) {
        if (key.keyHash === keyHash) {
          return key;
        }
      }
      return null;
    },
    listByTenant(tenantId) {
      return [...rows.values()]
        .filter((key) => key.tenantId === tenantId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    findById(tenantId, keyId) {
      const key = rows.get(keyId);
      return key && key.tenantId === tenantId ? key : null;
    },
    revoke(tenantId, keyId, revokedAt) {
      const key = rows.get(keyId);
      if (key && key.tenantId === tenantId) {
        rows.set(keyId, { ...key, revokedAt });
      }
    },
    touchLastUsed(tenantId, keyId, lastUsedAt) {
      const key = rows.get(keyId);
      if (key && key.tenantId === tenantId) {
        rows.set(keyId, { ...key, lastUsedAt });
      }
    }
  };
}

export function createFakeTicketsRepository(): TicketsRepository {
  const rows: Ticket[] = [];
  return {
    create(input) {
      const ticket: Ticket = { ...input };
      rows.push(ticket);
      return ticket;
    },
    listRecentByProject(tenantId, projectKey, limit) {
      return rows
        .filter((ticket) => ticket.tenantId === tenantId && ticket.projectKey === projectKey)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit);
    }
  };
}
