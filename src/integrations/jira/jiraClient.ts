import { z } from "zod";
import { textToAdf } from "./adf.js";

/**
 * The one place in the app that talks HTTP to Atlassian. Per CLAUDE.md:
 * authorize at auth.atlassian.com (audience=api.atlassian.com,
 * response_type=code, scopes read:jira-work write:jira-work offline_access,
 * single-use state); after exchange, resolve cloudId via
 * accessible-resources; all Jira API calls go through
 * api.atlassian.com/ex/jira/{cloudId}/rest/api/3/...
 *
 * Atlassian's JSON responses are parsed with zod at this boundary too (never
 * trust upstream blindly -- narrow `unknown` before it enters the rest of the
 * app), but with `.passthrough()` rather than `.strict()`: unlike our own API
 * contract in src/contract, we don't own this schema and must tolerate
 * Atlassian adding fields without breaking us.
 */

const AUTH_BASE_URL = "https://auth.atlassian.com";
const API_BASE_URL = "https://api.atlassian.com";
const OAUTH_SCOPES = "read:jira-work write:jira-work offline_access";

export interface JiraClientConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface JiraTokenSet {
  accessToken: string;
  refreshToken: string;
  /** ISO 8601 instant. */
  expiresAt: string;
}

export interface AccessibleResource {
  cloudId: string;
  siteUrl: string;
  name: string;
}

export interface JiraProjectApi {
  id: string;
  key: string;
  name: string;
}

export interface CreateIssueInput {
  projectKey: string;
  summary: string;
  description?: string;
  issueType: string;
}

export interface CreateIssueResult {
  id: string;
  key: string;
}

export interface JiraClient {
  buildAuthorizeUrl(state: string): string;
  exchangeCodeForTokens(code: string): Promise<JiraTokenSet>;
  refreshAccessToken(refreshToken: string): Promise<JiraTokenSet>;
  getAccessibleResources(accessToken: string): Promise<AccessibleResource[]>;
  listProjects(accessToken: string, cloudId: string): Promise<JiraProjectApi[]>;
  createIssue(accessToken: string, cloudId: string, input: CreateIssueInput): Promise<CreateIssueResult>;
}

/** Thrown for any non-2xx response or unreachable upstream. Callers map this to JIRA_UPSTREAM_ERROR (502). */
export class JiraApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "JiraApiError";
    this.status = status;
  }
}

const tokenResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.number()
});

const accessibleResourceSchema = z
  .object({
    id: z.string(),
    url: z.string(),
    name: z.string()
  })
  .passthrough();
const accessibleResourcesSchema = z.array(accessibleResourceSchema);

const projectSchema = z
  .object({
    id: z.string(),
    key: z.string(),
    name: z.string()
  })
  .passthrough();
const projectSearchResponseSchema = z
  .object({
    values: z.array(projectSchema),
    isLast: z.boolean()
  })
  .passthrough();

const createIssueResponseSchema = z
  .object({
    id: z.string(),
    key: z.string()
  })
  .passthrough();

async function fetchJson<T>(url: string, init: RequestInit, schema: z.ZodType<T>): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new JiraApiError("Could not reach Jira.", 0);
  }
  if (!response.ok) {
    // Deliberately not including the response body: it can echo back parts of
    // the request (and, for token calls, error text tied to a credential).
    throw new JiraApiError(`Jira responded with status ${response.status}.`, response.status);
  }
  const body: unknown = await response.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new JiraApiError("Jira returned a response in an unexpected shape.", response.status);
  }
  return parsed.data;
}

function toTokenSet(data: z.infer<typeof tokenResponseSchema>): JiraTokenSet {
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString()
  };
}

export function createJiraClient(config: JiraClientConfig): JiraClient {
  async function requestTokenSet(body: Record<string, string>): Promise<JiraTokenSet> {
    const data = await fetchJson(
      `${AUTH_BASE_URL}/oauth/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      },
      tokenResponseSchema
    );
    return toTokenSet(data);
  }

  return {
    buildAuthorizeUrl(state) {
      const url = new URL(`${AUTH_BASE_URL}/authorize`);
      url.searchParams.set("audience", "api.atlassian.com");
      url.searchParams.set("client_id", config.clientId);
      url.searchParams.set("scope", OAUTH_SCOPES);
      url.searchParams.set("redirect_uri", config.redirectUri);
      url.searchParams.set("state", state);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("prompt", "consent");
      return url.toString();
    },

    async exchangeCodeForTokens(code) {
      return requestTokenSet({
        grant_type: "authorization_code",
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: config.redirectUri
      });
    },

    async refreshAccessToken(refreshToken) {
      return requestTokenSet({
        grant_type: "refresh_token",
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: refreshToken
      });
    },

    async getAccessibleResources(accessToken) {
      const data = await fetchJson(
        `${API_BASE_URL}/oauth/token/accessible-resources`,
        { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } },
        accessibleResourcesSchema
      );
      return data.map((resource) => ({ cloudId: resource.id, siteUrl: resource.url, name: resource.name }));
    },

    async listProjects(accessToken, cloudId) {
      const allProjects: JiraProjectApi[] = [];
      let startAt = 0;
      const maxResults = 100;
      const MAX_PAGES = 100;
      let page = 0;

      while (true) {
        if (page >= MAX_PAGES) {
          throw new JiraApiError("Jira project listing exceeded the maximum page limit.", 0);
        }
        const url = `${API_BASE_URL}/ex/jira/${cloudId}/rest/api/3/project/search?maxResults=${maxResults}&startAt=${startAt}`;
        const data = await fetchJson(
          url,
          { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } },
          projectSearchResponseSchema
        );
        for (const project of data.values) {
          allProjects.push({ id: project.id, key: project.key, name: project.name });
        }
        if (data.isLast || data.values.length === 0) {
          break;
        }
        startAt += data.values.length;
        page += 1;
      }

      return allProjects;
    },

    async createIssue(accessToken, cloudId, input) {
      const fields = {
        project: { key: input.projectKey },
        summary: input.summary,
        issuetype: { name: input.issueType },
        ...(input.description ? { description: textToAdf(input.description) } : {})
      };
      const url = `${API_BASE_URL}/ex/jira/${cloudId}/rest/api/3/issue`;
      const data = await fetchJson(
        url,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            Accept: "application/json"
          },
          body: JSON.stringify({ fields })
        },
        createIssueResponseSchema
      );
      return { id: data.id, key: data.key };
    }
  };
}
