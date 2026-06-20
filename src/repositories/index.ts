import type Database from "better-sqlite3";
import { createApiKeysRepository } from "./apiKeys.repository.js";
import { createJiraCredentialsRepository } from "./jiraCredentials.repository.js";
import { createSessionsRepository } from "./sessions.repository.js";
import { createTenantsRepository } from "./tenants.repository.js";
import { createTicketsRepository } from "./tickets.repository.js";
import { createUsersRepository } from "./users.repository.js";

export type Repositories = ReturnType<typeof createRepositories>;

/** Wires every repository against one DB handle. Services depend on this shape (or a fake of it) -- never on better-sqlite3 directly. */
export function createRepositories(db: Database.Database) {
  return {
    tenants: createTenantsRepository(db),
    users: createUsersRepository(db),
    sessions: createSessionsRepository(db),
    jiraCredentials: createJiraCredentialsRepository(db),
    apiKeys: createApiKeysRepository(db),
    tickets: createTicketsRepository(db)
  };
}

export * from "./types.js";
