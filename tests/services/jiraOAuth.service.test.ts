import { beforeEach, describe, expect, it } from "vitest";
import { createJiraOAuthService, type JiraOAuthService } from "../../src/services/jiraOAuth.service.js";
import { createFakeJiraCredentialsRepository } from "../fakes/fakeRepositories.js";
import { createFakeJiraClient, type FakeJiraClient } from "../fakes/fakeJiraClient.js";

const ENCRYPTION_KEY = Buffer.alloc(32, 3);
const TENANT_A = "tenant-a";
const TENANT_B = "tenant-b";

function extractState(authorizeUrl: string): string {
  const state = new URL(authorizeUrl).searchParams.get("state");
  if (!state) {
    throw new Error("test setup: authorize URL had no state param");
  }
  return state;
}

describe("jiraOAuth.service", () => {
  let currentTime: Date;
  let fakeJiraClient: FakeJiraClient;
  let credentialsRepo: ReturnType<typeof createFakeJiraCredentialsRepository>;
  let service: JiraOAuthService;

  beforeEach(() => {
    currentTime = new Date("2026-01-01T00:00:00.000Z");
    fakeJiraClient = createFakeJiraClient({ now: () => currentTime });
    credentialsRepo = createFakeJiraCredentialsRepository();
    service = createJiraOAuthService({
      jiraClient: fakeJiraClient,
      jiraCredentials: credentialsRepo,
      encryptionKey: ENCRYPTION_KEY,
      stateTtlMs: 10 * 60 * 1000,
      clock: () => currentTime
    });
  });

  it("reports not connected before any callback completes", () => {
    expect(service.getStatus(TENANT_A)).toEqual({ connected: false });
  });

  it("connect + handleCallback persists credentials and flips status to connected", async () => {
    const authorizeUrl = service.connect(TENANT_A);
    const state = extractState(authorizeUrl);

    await service.handleCallback({ state, code: "fake-code" });

    const status = service.getStatus(TENANT_A);
    expect(status).toEqual({ connected: true, siteUrl: "https://fake.atlassian.net" });
  });

  it("never persists the access/refresh tokens in plaintext", async () => {
    const authorizeUrl = service.connect(TENANT_A);
    const state = extractState(authorizeUrl);
    await service.handleCallback({ state, code: "fake-code" });

    const stored = credentialsRepo.findByTenant(TENANT_A);
    expect(stored?.accessTokenEncrypted).not.toContain("fake-access-token");
    expect(stored?.refreshTokenEncrypted).not.toContain("refresh-for-fake-code");
  });

  it("rejects an unknown state", async () => {
    await expect(service.handleCallback({ state: "never-issued", code: "fake-code" })).rejects.toMatchObject({
      code: "INVALID_OAUTH_STATE"
    });
  });

  it("state is single-use: replaying it fails even with the right code", async () => {
    const authorizeUrl = service.connect(TENANT_A);
    const state = extractState(authorizeUrl);

    await service.handleCallback({ state, code: "fake-code" });
    await expect(service.handleCallback({ state, code: "fake-code" })).rejects.toMatchObject({
      code: "INVALID_OAUTH_STATE"
    });
  });

  it("rejects a state that has expired", async () => {
    const authorizeUrl = service.connect(TENANT_A);
    const state = extractState(authorizeUrl);

    currentTime = new Date(currentTime.getTime() + 11 * 60 * 1000); // past the 10-minute TTL
    await expect(service.handleCallback({ state, code: "fake-code" })).rejects.toMatchObject({
      code: "INVALID_OAUTH_STATE"
    });
  });

  it("treats a denied-consent callback (error param, no code) as an upstream failure, consuming the state", async () => {
    const authorizeUrl = service.connect(TENANT_A);
    const state = extractState(authorizeUrl);

    await expect(service.handleCallback({ state, error: "access_denied" })).rejects.toMatchObject({
      code: "JIRA_UPSTREAM_ERROR"
    });
    // Single-use even on failure: replaying should be INVALID_OAUTH_STATE, not JIRA_UPSTREAM_ERROR again.
    await expect(service.handleCallback({ state, code: "fake-code" })).rejects.toMatchObject({
      code: "INVALID_OAUTH_STATE"
    });
  });

  it("getValidAccessToken throws JIRA_NOT_CONNECTED when there is no credential row", async () => {
    await expect(service.getValidAccessToken(TENANT_A)).rejects.toMatchObject({ code: "JIRA_NOT_CONNECTED" });
  });

  it("getValidAccessToken returns the decrypted token without refreshing when not near expiry", async () => {
    const authorizeUrl = service.connect(TENANT_A);
    await service.handleCallback({ state: extractState(authorizeUrl), code: "fake-code" });

    const result = await service.getValidAccessToken(TENANT_A);
    expect(result.accessToken).toBe("fake-access-token");
    expect(fakeJiraClient.refreshCallCount).toBe(0);
  });

  it("refreshes and persists rotated tokens once the access token is near expiry", async () => {
    const authorizeUrl = service.connect(TENANT_A);
    await service.handleCallback({ state: extractState(authorizeUrl), code: "fake-code" });
    const beforeRefresh = credentialsRepo.findByTenant(TENANT_A);

    currentTime = new Date(currentTime.getTime() + 59 * 60 * 1000); // token issued with a 1h TTL; now within the 60s skew window
    const result = await service.getValidAccessToken(TENANT_A);

    expect(fakeJiraClient.refreshCallCount).toBe(1);
    expect(result.accessToken).toContain("rotated-access");

    const afterRefresh = credentialsRepo.findByTenant(TENANT_A);
    expect(afterRefresh?.accessTokenEncrypted).not.toBe(beforeRefresh?.accessTokenEncrypted);
    expect(afterRefresh?.refreshTokenEncrypted).not.toBe(beforeRefresh?.refreshTokenEncrypted);
  });

  it("serializes concurrent refreshes for the same tenant into a single upstream call", async () => {
    const authorizeUrl = service.connect(TENANT_A);
    await service.handleCallback({ state: extractState(authorizeUrl), code: "fake-code" });

    currentTime = new Date(currentTime.getTime() + 59 * 60 * 1000);
    const [first, second] = await Promise.all([service.getValidAccessToken(TENANT_A), service.getValidAccessToken(TENANT_A)]);

    expect(fakeJiraClient.refreshCallCount).toBe(1);
    expect(first.accessToken).toBe(second.accessToken);
  });

  it("does not serialize refreshes across different tenants (the lock is per-tenant, not global)", async () => {
    const authorizeUrlA = service.connect(TENANT_A);
    await service.handleCallback({ state: extractState(authorizeUrlA), code: "fake-code" });
    const authorizeUrlB = service.connect(TENANT_B);
    await service.handleCallback({ state: extractState(authorizeUrlB), code: "fake-code" });

    currentTime = new Date(currentTime.getTime() + 59 * 60 * 1000);
    const [forA, forB] = await Promise.all([service.getValidAccessToken(TENANT_A), service.getValidAccessToken(TENANT_B)]);

    // Two tenants, two independent refreshes -- if the lock were accidentally
    // global instead of per-tenant, one tenant's refresh would have been
    // skipped/deduped and this would be 1, not 2.
    expect(fakeJiraClient.refreshCallCount).toBe(2);
    expect(forA.accessToken).toContain("rotated-access");
    expect(forB.accessToken).toContain("rotated-access");
  });
});
