import { AppError } from "../contract/errors.js";
import type { JiraClient, JiraProjectApi } from "../integrations/jira/jiraClient.js";
import { withJiraErrorMapping } from "./shared/jiraErrorMapping.js";
import type { JiraOAuthService } from "./jiraOAuth.service.js";

const PROJECT_CACHE_TTL_MS = 30_000;

export interface JiraServiceConfig {
  jiraClient: JiraClient;
  jiraOAuth: JiraOAuthService;
  /** Injectable clock for tests; defaults to Date.now. */
  clock?: () => number;
}

export interface JiraService {
  listProjects(tenantId: string): Promise<JiraProjectApi[]>;
  /** Validates a user/scanner-supplied project key against the connected workspace; returns Jira's canonical record. */
  resolveProject(tenantId: string, projectKey: string): Promise<JiraProjectApi>;
}

export function createJiraService(config: JiraServiceConfig): JiraService {
  const clock = config.clock ?? (() => Date.now());
  const projectCache = new Map<string, { projects: JiraProjectApi[]; expiresAt: number }>();

  async function listProjects(tenantId: string): Promise<JiraProjectApi[]> {
    const cached = projectCache.get(tenantId);
    if (cached && clock() < cached.expiresAt) {
      return cached.projects;
    }
    const { accessToken, cloudId } = await config.jiraOAuth.getValidAccessToken(tenantId);
    const projects = await withJiraErrorMapping(() => config.jiraClient.listProjects(accessToken, cloudId));
    projectCache.set(tenantId, { projects, expiresAt: clock() + PROJECT_CACHE_TTL_MS });
    return projects;
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
