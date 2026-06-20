import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { JiraCredential, JiraCredentialsRepository } from "./types.js";

interface JiraCredentialRow {
  id: string;
  tenant_id: string;
  cloud_id: string;
  site_url: string;
  access_token_encrypted: string;
  refresh_token_encrypted: string;
  access_token_expires_at: string;
  created_at: string;
  updated_at: string;
}

function toJiraCredential(row: JiraCredentialRow): JiraCredential {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    cloudId: row.cloud_id,
    siteUrl: row.site_url,
    accessTokenEncrypted: row.access_token_encrypted,
    refreshTokenEncrypted: row.refresh_token_encrypted,
    accessTokenExpiresAt: row.access_token_expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

const COLUMNS =
  "id, tenant_id, cloud_id, site_url, access_token_encrypted, refresh_token_encrypted, access_token_expires_at, created_at, updated_at";

/** One credential row per tenant (reconnecting overwrites the existing row via upsert). */
export function createJiraCredentialsRepository(db: Database.Database): JiraCredentialsRepository {
  const upsertStmt = db.prepare<[string, string, string, string, string, string, string, string, string]>(
    `INSERT INTO jira_credentials
       (id, tenant_id, cloud_id, site_url, access_token_encrypted, refresh_token_encrypted, access_token_expires_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(tenant_id) DO UPDATE SET
       cloud_id = excluded.cloud_id,
       site_url = excluded.site_url,
       access_token_encrypted = excluded.access_token_encrypted,
       refresh_token_encrypted = excluded.refresh_token_encrypted,
       access_token_expires_at = excluded.access_token_expires_at,
       updated_at = excluded.updated_at`
  );
  const selectByTenant = db.prepare<[string], JiraCredentialRow>(
    `SELECT ${COLUMNS} FROM jira_credentials WHERE tenant_id = ?`
  );
  const updateTokensStmt = db.prepare<[string, string, string, string, string]>(
    `UPDATE jira_credentials
     SET access_token_encrypted = ?, refresh_token_encrypted = ?, access_token_expires_at = ?, updated_at = ?
     WHERE tenant_id = ?`
  );

  return {
    upsert(input) {
      const id = randomUUID();
      upsertStmt.run(
        id,
        input.tenantId,
        input.cloudId,
        input.siteUrl,
        input.accessTokenEncrypted,
        input.refreshTokenEncrypted,
        input.accessTokenExpiresAt,
        input.now,
        input.now
      );
      const row = selectByTenant.get(input.tenantId);
      if (!row) {
        throw new Error("Failed to read back jira_credentials row after upsert.");
      }
      return toJiraCredential(row);
    },
    findByTenant(tenantId) {
      const row = selectByTenant.get(tenantId);
      return row ? toJiraCredential(row) : null;
    },
    updateTokens(tenantId, fields) {
      updateTokensStmt.run(
        fields.accessTokenEncrypted,
        fields.refreshTokenEncrypted,
        fields.accessTokenExpiresAt,
        fields.now,
        tenantId
      );
    }
  };
}
