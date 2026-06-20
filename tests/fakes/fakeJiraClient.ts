import { JiraApiError, type CreateIssueInput, type CreateIssueResult, type JiraClient, type JiraProjectApi } from "../../src/integrations/jira/jiraClient.js";

interface FakeTokenMapping {
  accessToken: string;
  cloudId: string;
  siteUrl: string;
}

export interface FakeJiraClientOptions {
  /** Maps the OAuth `code` a test passes to handleCallback() to a deterministic (accessToken, cloudId, siteUrl) triple. */
  tokensByCode?: Record<string, FakeTokenMapping>;
  /** What listProjects() returns for a given cloudId. */
  projectsByCloudId?: Record<string, JiraProjectApi[]>;
  createIssueResult?: CreateIssueResult;
  /** Clock used to compute token expiresAt. Must match the test's injected clock, or expiry-dependent tests (refresh, skew) will be comparing against the wrong era. Defaults to the real clock. */
  now?: () => Date;
}

const DEFAULT_MAPPING: FakeTokenMapping = {
  accessToken: "fake-access-token",
  cloudId: "fake-cloud-id",
  siteUrl: "https://fake.atlassian.net"
};

export interface FakeJiraClient extends JiraClient {
  createIssueCalls: CreateIssueInput[];
  refreshCallCount: number;
}

/** A JiraClient that never makes a network call -- everything is deterministic and configured by the test. */
export function createFakeJiraClient(options: FakeJiraClientOptions = {}): FakeJiraClient {
  const tokensByCode = options.tokensByCode ?? { "fake-code": DEFAULT_MAPPING };
  const projectsByCloudId =
    options.projectsByCloudId ?? { [DEFAULT_MAPPING.cloudId]: [{ id: "10000", key: "PROJ", name: "Project" }] };

  const accessTokenToResource = new Map<string, { cloudId: string; siteUrl: string }>();
  for (const mapping of Object.values(tokensByCode)) {
    accessTokenToResource.set(mapping.accessToken, { cloudId: mapping.cloudId, siteUrl: mapping.siteUrl });
  }

  const now = options.now ?? (() => new Date());
  const createIssueCalls: CreateIssueInput[] = [];
  let refreshCallCount = 0;

  return {
    createIssueCalls,
    get refreshCallCount() {
      return refreshCallCount;
    },

    buildAuthorizeUrl(state) {
      return `https://auth.atlassian.com/authorize?state=${encodeURIComponent(state)}`;
    },

    async exchangeCodeForTokens(code) {
      const mapped = tokensByCode[code];
      if (!mapped) {
        throw new JiraApiError("Unknown fake authorization code.", 400);
      }
      return {
        accessToken: mapped.accessToken,
        refreshToken: `refresh-for-${code}`,
        expiresAt: new Date(now().getTime() + 3_600_000).toISOString()
      };
    },

    async refreshAccessToken(refreshToken) {
      refreshCallCount += 1;
      // Simulate a small delay so concurrent-refresh tests can observe overlap.
      await new Promise((resolve) => setTimeout(resolve, 10));
      return {
        accessToken: `${refreshToken}-rotated-access`,
        refreshToken: `${refreshToken}-rotated-refresh`,
        expiresAt: new Date(now().getTime() + 3_600_000).toISOString()
      };
    },

    async getAccessibleResources(accessToken) {
      const resource = accessTokenToResource.get(accessToken);
      if (!resource) {
        return [];
      }
      return [{ cloudId: resource.cloudId, siteUrl: resource.siteUrl, name: "Fake Site" }];
    },

    async listProjects(_accessToken, cloudId) {
      return projectsByCloudId[cloudId] ?? [];
    },

    async createIssue(_accessToken, _cloudId, input) {
      createIssueCalls.push(input);
      return options.createIssueResult ?? { id: "10001", key: "PROJ-1" };
    }
  };
}
