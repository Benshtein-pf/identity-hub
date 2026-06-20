import type Database from "better-sqlite3";
import type { User, UsersRepository } from "./types.js";

interface UserRow {
  id: string;
  tenant_id: string;
  email: string;
  password_hash: string;
  created_at: string;
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    email: row.email,
    passwordHash: row.password_hash,
    createdAt: row.created_at
  };
}

const COLUMNS = "id, tenant_id, email, password_hash, created_at";

export function createUsersRepository(db: Database.Database): UsersRepository {
  const insert = db.prepare<[string, string, string, string, string]>(
    "INSERT INTO users (id, tenant_id, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)"
  );
  const selectByEmail = db.prepare<[string], UserRow>(`SELECT ${COLUMNS} FROM users WHERE email = ?`);
  const selectByTenantAndId = db.prepare<[string, string], UserRow>(
    `SELECT ${COLUMNS} FROM users WHERE tenant_id = ? AND id = ?`
  );

  return {
    create(input) {
      insert.run(input.id, input.tenantId, input.email, input.passwordHash, input.createdAt);
      return {
        id: input.id,
        tenantId: input.tenantId,
        email: input.email,
        passwordHash: input.passwordHash,
        createdAt: input.createdAt
      };
    },
    findByEmail(email) {
      const row = selectByEmail.get(email);
      return row ? toUser(row) : null;
    },
    findById(tenantId, userId) {
      const row = selectByTenantAndId.get(tenantId, userId);
      return row ? toUser(row) : null;
    }
  };
}
