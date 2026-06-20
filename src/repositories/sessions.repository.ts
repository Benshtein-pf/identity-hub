import type Database from "better-sqlite3";
import type { Session, SessionsRepository } from "./types.js";

interface SessionRow {
  id: string;
  tenant_id: string;
  user_id: string;
  created_at: string;
  last_active_at: string;
  expires_at: string;
}

function toSession(row: SessionRow): Session {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    createdAt: row.created_at,
    lastActiveAt: row.last_active_at,
    expiresAt: row.expires_at
  };
}

const COLUMNS = "id, tenant_id, user_id, created_at, last_active_at, expires_at";

export function createSessionsRepository(db: Database.Database): SessionsRepository {
  const insert = db.prepare<[string, string, string, string, string, string]>(
    "INSERT INTO sessions (id, tenant_id, user_id, created_at, last_active_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)"
  );
  const selectById = db.prepare<[string], SessionRow>(`SELECT ${COLUMNS} FROM sessions WHERE id = ?`);
  const updateTouch = db.prepare<[string, string, string, string]>(
    "UPDATE sessions SET last_active_at = ?, expires_at = ? WHERE tenant_id = ? AND id = ?"
  );
  const deleteById = db.prepare<[string, string]>("DELETE FROM sessions WHERE tenant_id = ? AND id = ?");

  return {
    create(input) {
      insert.run(input.id, input.tenantId, input.userId, input.createdAt, input.lastActiveAt, input.expiresAt);
      return { ...input };
    },
    findById(sessionId) {
      const row = selectById.get(sessionId);
      return row ? toSession(row) : null;
    },
    touch(tenantId, sessionId, lastActiveAt, expiresAt) {
      updateTouch.run(lastActiveAt, expiresAt, tenantId, sessionId);
    },
    delete(tenantId, sessionId) {
      deleteById.run(tenantId, sessionId);
    }
  };
}
