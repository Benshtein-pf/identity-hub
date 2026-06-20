import type Database from "better-sqlite3";
import type { Tenant, TenantsRepository } from "./types.js";

interface TenantRow {
  id: string;
  created_at: string;
}

function toTenant(row: TenantRow): Tenant {
  return { id: row.id, createdAt: row.created_at };
}

/** Bootstrap writes (creating the tenant itself) are not tenant-scoped -- there is no tenant yet. */
export function createTenantsRepository(db: Database.Database): TenantsRepository {
  const insert = db.prepare<[string, string]>("INSERT INTO tenants (id, created_at) VALUES (?, ?)");
  const selectById = db.prepare<[string], TenantRow>("SELECT id, created_at FROM tenants WHERE id = ?");

  return {
    create(input) {
      insert.run(input.id, input.createdAt);
      return { id: input.id, createdAt: input.createdAt };
    },
    findById(tenantId) {
      const row = selectById.get(tenantId);
      return row ? toTenant(row) : null;
    }
  };
}
