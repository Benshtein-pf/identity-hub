import type Database from "better-sqlite3";
import type { Ticket, TicketsRepository } from "./types.js";

interface TicketRow {
  id: string;
  tenant_id: string;
  jira_issue_key: string;
  jira_issue_id: string;
  project_key: string;
  title: string;
  source: string;
  created_at: string;
}

function toTicketSource(value: string): "ui" | "api" {
  if (value === "ui" || value === "api") {
    return value;
  }
  throw new Error(`Unexpected ticket source in DB row: ${value}`);
}

function toTicket(row: TicketRow): Ticket {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    jiraIssueKey: row.jira_issue_key,
    jiraIssueId: row.jira_issue_id,
    projectKey: row.project_key,
    title: row.title,
    source: toTicketSource(row.source),
    createdAt: row.created_at
  };
}

const COLUMNS = "id, tenant_id, jira_issue_key, jira_issue_id, project_key, title, source, created_at";

export function createTicketsRepository(db: Database.Database): TicketsRepository {
  const insert = db.prepare<[string, string, string, string, string, string, string, string]>(
    `INSERT INTO tickets (id, tenant_id, jira_issue_key, jira_issue_id, project_key, title, source, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const selectRecentByProject = db.prepare<[string, string, number], TicketRow>(
    `SELECT ${COLUMNS} FROM tickets
     WHERE tenant_id = ? AND project_key = ?
     ORDER BY created_at DESC
     LIMIT ?`
  );

  return {
    create(input) {
      insert.run(
        input.id,
        input.tenantId,
        input.jiraIssueKey,
        input.jiraIssueId,
        input.projectKey,
        input.title,
        input.source,
        input.createdAt
      );
      return { ...input };
    },
    listRecentByProject(tenantId, projectKey, limit) {
      return selectRecentByProject.all(tenantId, projectKey, limit).map(toTicket);
    }
  };
}
