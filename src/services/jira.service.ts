import { AppError } from "../contract/errors.js";
import type { JiraClient, JiraProjectApi } from "../integrations/jira/jiraClient.js";
import { withJiraErrorMapping } from "./shared/jiraErrorMapping.js";
import type { JiraOAuthService } from "./jiraOAuth.service.js";

export interface JiraServiceConfig {
  jiraClient: JiraClient;
  jiraOAuth: JiraOAuthService;
}

export interface JiraService {
  listProjects(tenantId: string): Promise<JiraProjectApi[]>;
  /** Validates a user/scanner-supplied project key against the connected workspace; returns Jira's canonical record. */
  resolveProject(tenantId: string, projectKey: string): Promise<JiraProjectApi>;
}

export function createJiraService(config: JiraServiceConfig): JiraService {
  async function listProjects(tenantId: string): Promise<JiraProjectApi[]> {
    const { accessToken, cloudId } = await config.jiraOAuth.getValidAccessToken(tenantId);
    return withJiraErrorMapping(() => config.jiraClient.listProjects(accessToken, cloudId));
  }

  return {
    listProjects,

    async resolveProject(tenantId, projectKey) {
      const projects = await listProjects(tenantId);
      const normalized = projectKey.trim().toUpperCase();
      const found = projects.find((project) => project.key.toUpperCase() === normalized);
      if (!found) {
        throw new AppError(
          "PROJECT_NOT_FOUND",
          `Project "${projectKey}" was not found in your connected Jira workspace.`
        );
      }
      return found;
    }
  };
}
