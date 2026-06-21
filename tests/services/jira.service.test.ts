import { beforeEach, describe, expect, it } from "vitest";
import { createJiraService, type JiraService } from "../../src/services/jira.service.js";
import { createJiraOAuthService } from "../../src/services/jiraOAuth.service.js";
import { createFakeJiraClient } from "../fakes/fakeJiraClient.js";
import { createFakeJiraCredentialsRepository } from "../fakes/fakeRepositories.js";
import { encryptToString, validateEncryptionKey } from "../../src/crypto/encryption.js";

const TEST_KEY_B64 = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="; // 32 zero bytes in base64
const encryptionKey = validateEncryptionKey(TEST_KEY_B64);

function makeIsoInFuture(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

function buildServiceWithProjects(projects: { id: string; key: string; name: string }[]): {
  jiraService: JiraService;
  tenantId: string;
} {
  const tenantId = "tenant-test";
  const fakeJiraClient = createFakeJiraClient({
    projectsByCloudId: { "cloud-test": projects }
  });
  const fakeCredentials = createFakeJiraCredentialsRepository();
  fakeCredentials.upsert({
    tenantId,
    cloudId: "cloud-test",
    siteUrl: "https://test.atlassian.net",
    accessTokenEncrypted: encryptToString("access-token", encryptionKey),
    refreshTokenEncrypted: encryptToString("refresh-token", encryptionKey),
    accessTokenExpiresAt: makeIsoInFuture(3_600_000),
    now: new Date().toISOString()
  });

  const jiraOAuth = createJiraOAuthService({
    jiraClient: fakeJiraClient,
    jiraCredentials: fakeCredentials,
    encryptionKey
  });

  const jiraService = createJiraService({ jiraClient: fakeJiraClient, jiraOAuth });

  return { jiraService, tenantId };
}

describe("jira.service", () => {
  describe("listProjects", () => {
    it("returns the projects from the connected workspace", async () => {
      const { jiraService, tenantId } = buildServiceWithProjects([
        { id: "1", key: "ALPHA", name: "Alpha" },
        { id: "2", key: "BETA", name: "Beta" }
      ]);

      const projects = await jiraService.listProjects(tenantId);
      expect(projects).toHaveLength(2);
      expect(projects.map((p) => p.key)).toEqual(["ALPHA", "BETA"]);
    });
  });

  describe("resolveProject", () => {
    it("returns the Jira project record for a matching key (exact case)", async () => {
      const { jiraService, tenantId } = buildServiceWithProjects([{ id: "1", key: "ALPHA", name: "Alpha Project" }]);

      const project = await jiraService.resolveProject(tenantId, "ALPHA");
      expect(project.key).toBe("ALPHA");
      expect(project.name).toBe("Alpha Project");
    });

    it("matches project keys case-insensitively", async () => {
      const { jiraService, tenantId } = buildServiceWithProjects([{ id: "1", key: "ALPHA", name: "Alpha" }]);

      const project = await jiraService.resolveProject(tenantId, "alpha");
      expect(project.key).toBe("ALPHA");
    });

    it("trims whitespace from the supplied project key before matching", async () => {
      const { jiraService, tenantId } = buildServiceWithProjects([{ id: "1", key: "ALPHA", name: "Alpha" }]);

      const project = await jiraService.resolveProject(tenantId, "  ALPHA  ");
      expect(project.key).toBe("ALPHA");
    });

    it("throws PROJECT_NOT_FOUND when the key does not exist in the workspace", async () => {
      const { jiraService, tenantId } = buildServiceWithProjects([{ id: "1", key: "ALPHA", name: "Alpha" }]);

      await expect(jiraService.resolveProject(tenantId, "NONEXISTENT")).rejects.toMatchObject({
        code: "PROJECT_NOT_FOUND"
      });
    });

    it("throws JIRA_NOT_CONNECTED when no credential is stored for the tenant", async () => {
      const fakeJiraClient = createFakeJiraClient();
      const fakeCredentials = createFakeJiraCredentialsRepository();
      const jiraOAuth = createJiraOAuthService({
        jiraClient: fakeJiraClient,
        jiraCredentials: fakeCredentials,
        encryptionKey
      });
      const jiraService = createJiraService({ jiraClient: fakeJiraClient, jiraOAuth });

      await expect(jiraService.resolveProject("no-tenant", "ALPHA")).rejects.toMatchObject({
        code: "JIRA_NOT_CONNECTED"
      });
    });
  });

  describe("project cache", () => {
    it("returns cached results and does not re-fetch within the TTL", async () => {
      let callCount = 0;
      const fakeJiraClient = createFakeJiraClient({
        projectsByCloudId: { "cloud-test": [{ id: "1", key: "PROJ", name: "Project" }] }
      });
      const origListProjects = fakeJiraClient.listProjects.bind(fakeJiraClient);
      fakeJiraClient.listProjects = async (token, cloudId) => {
        callCount += 1;
        return origListProjects(token, cloudId);
      };

      const fakeCredentials = createFakeJiraCredentialsRepository();
      const tenantId = "tenant-cache";
      fakeCredentials.upsert({
        tenantId,
        cloudId: "cloud-test",
        siteUrl: "https://test.atlassian.net",
        accessTokenEncrypted: encryptToString("access-token", encryptionKey),
        refreshTokenEncrypted: encryptToString("refresh-token", encryptionKey),
        accessTokenExpiresAt: makeIsoInFuture(3_600_000),
        now: new Date().toISOString()
      });

      let now = Date.now();
      const jiraOAuth = createJiraOAuthService({ jiraClient: fakeJiraClient, jiraCredentials: fakeCredentials, encryptionKey });
      const jiraService = createJiraService({ jiraClient: fakeJiraClient, jiraOAuth, clock: () => now });

      await jiraService.listProjects(tenantId);
      await jiraService.listProjects(tenantId); // should hit cache
      expect(callCount).toBe(1);

      now += 31_000; // advance past 30s TTL
      await jiraService.listProjects(tenantId); // should re-fetch
      expect(callCount).toBe(2);
    });
  });
});
