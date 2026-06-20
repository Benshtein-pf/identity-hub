import type Database from "better-sqlite3";
import type { ApiKey, ApiKeysRepository } from "./types.js";

interface ApiKeyRow {
  id: string;
  tenant_id: string;
  name: string;
  key_hash: string;
  key_prefix: string;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  last_used_at: string | null;
}

function toApiKey(row: ApiKeyRow): ApiKey {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    keyHash: row.key_hash,
    keyPrefix: row.key_prefix,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    lastUsedAt: row.last_used_at
  };
}

const COLUMNS = "id, tenant_id, name, key_hash, key_prefix, created_at, expires_at, revoked_at, last_used_at";

export function createApiKeysRepository(db: Database.Database): ApiKeysRepository {
  const insert = db.prepare<[string, string, string, string, string, string, string | null]>(
    `INSERT INTO api_keys (id, tenant_id, name, key_hash, key_prefix, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const selectByHash = db.prepare<[string], ApiKeyRow>(`SELECT ${COLUMNS} FROM api_keys WHERE key_hash = ?`);
  const selectByTenant = db.prepare<[string], ApiKeyRow>(
    `SELECT ${COLUMNS} FROM api_keys WHERE tenant_id = ? ORDER BY created_at DESC`
  );
  const selectByTenantAndId = db.prepare<[string, string], ApiKeyRow>(
    `SELECT ${COLUMNS} FROM api_keys WHERE tenant_id = ? AND id = ?`
  );
  const updateRevoked = db.prepare<[string, string, string]>(
    "UPDATE api_keys SET revoked_at = ? WHERE tenant_id = ? AND id = ?"
  );
  const updateLastUsed = db.prepare<[string, string, string]>(
    "UPDATE api_keys SET last_used_at = ? WHERE tenant_id = ? AND id = ?"
  );

  return {
    create(input) {
      insert.run(input.id, input.tenantId, input.name, input.keyHash, input.keyPrefix, input.createdAt, input.expiresAt);
      return {
        id: input.id,
        tenantId: input.tenantId,
        name: input.name,
        keyHash: input.keyHash,
        keyPrefix: input.keyPrefix,
        createdAt: input.createdAt,
        expiresAt: input.expiresAt,
        revokedAt: null,
        lastUsedAt: null
      };
    },
    findByHash(keyHash) {
      const row = selectByHash.get(keyHash);
      return row ? toApiKey(row) : null;
    },
    listByTenant(tenantId) {
      return selectByTenant.all(tenantId).map(toApiKey);
    },
    findById(tenantId, keyId) {
      const row = selectByTenantAndId.get(tenantId, keyId);
      return row ? toApiKey(row) : null;
    },
    revoke(tenantId, keyId, revokedAt) {
      updateRevoked.run(revokedAt, tenantId, keyId);
    },
    touchLastUsed(tenantId, keyId, lastUsedAt) {
      updateLastUsed.run(lastUsedAt, tenantId, keyId);
    }
  };
}
