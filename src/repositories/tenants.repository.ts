import type Database from "better-sqlite3";
import type { Tenant, TenantsRepository, User } from "./types.js";

interface TenantRow {
  id: string;
  created_at: string;
}

function toTenant(row: TenantRow): Tenant {
  return { id: row.id, createdAt: row.created_at };
}

/** Bootstrap writes (creating the tenant itself) are not tenant-scoped -- there is no tenant yet. */
export function createTenantsRepository(db: Database.Database): TenantsRepository {
  const insertTenant = db.prepare<[string, string]>("INSERT INTO tenants (id, created_at) VALUES (?, ?)");
  const insertUser = db.prepare<[string, string, string, string, string]>(
    "INSERT INTO users (id, tenant_id, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)"
  );
  const selectById = db.prepare<[string], TenantRow>("SELECT id, created_at FROM tenants WHERE id = ?");

  const createWithFirstUserTx = db.transaction(
    (
      tenantInput: { id: string; createdAt: string },
      userInput: { id: string; tenantId: string; email: string; passwordHash: string; createdAt: string }
    ): { tenant: Tenant; user: User } => {
      insertTenant.run(tenantInput.id, tenantInput.createdAt);
      insertUser.run(userInput.id, userInput.tenantId, userInput.email, userInput.passwordHash, userInput.createdAt);
      return {
        tenant: { id: tenantInput.id, createdAt: tenantInput.createdAt },
        user: { ...userInput }
      };
    }
  );

  return {
    create(input) {
      insertTenant.run(input.id, input.createdAt);
      return { id: input.id, createdAt: input.createdAt };
    },
    findById(tenantId) {
      const row = selectById.get(tenantId);
      return row ? toTenant(row) : null;
    },
    createWithFirstUser(input) {
      return createWithFirstUserTx(input.tenant, input.user);
    }
  };
}
