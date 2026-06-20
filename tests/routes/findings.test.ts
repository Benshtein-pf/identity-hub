import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp, createDependencies, type AppDependencies } from "../../src/app.js";
import { createFakeJiraClient } from "../fakes/fakeJiraClient.js";

/**
 * Exercises the external REST API (deliverable 7) end-to-end through
 * Fastify's `.inject()` -- real routes, real plugins (auth, rate limit,
 * error handler), real in-memory SQLite, with only the Jira HTTP client
 * faked out. Covers: auth required, validation rejects bad input, correct
 * status codes, and tenant isolation (CLAUDE.md's non-negotiable).
 */

function extractState(authorizeUrl: string): string {
  const state = new URL(authorizeUrl).searchParams.get("state");
  if (!state) {
    throw new Error("test setup: authorize URL had no state param");
  }
  return state;
}

interface TenantFixture {
  tenantId: string;
  apiKeySecret: string;
}

async function registerAndConnect(deps: AppDependencies, email: string, code: string): Promise<TenantFixture> {
  const { user } = await deps.authService.register(email, "correct-password");
  const authorizeUrl = deps.jiraOAuthService.connect(user.tenantId);
  await deps.jiraOAuthService.handleCallback({ state: extractState(authorizeUrl), code });
  const { secret } = deps.apiKeysService.createApiKey(user.tenantId, {});
  return { tenantId: user.tenantId, apiKeySecret: secret };
}

describe("POST /api/v1/findings", () => {
  let app: FastifyInstance;
  let deps: AppDependencies;
  let tenantA: TenantFixture;
  let tenantB: TenantFixture;

  beforeEach(async () => {
    const fakeJiraClient = createFakeJiraClient({
      tokensByCode: {
        "code-a": { accessToken: "token-a", cloudId: "cloud-a", siteUrl: "https://a.atlassian.net" },
        "code-b": { accessToken: "token-b", cloudId: "cloud-b", siteUrl: "https://b.atlassian.net" }
      },
      // Both tenants' workspaces happen to have a project literally named
      // ALPHA (plausible: different Jira sites, same key) -- this lets the
      // isolation test prove tenant_id scoping rather than just "different
      // project keys don't collide", which would be a weaker proof.
      projectsByCloudId: {
        "cloud-a": [{ id: "1", key: "ALPHA", name: "Alpha (tenant A)" }],
        "cloud-b": [
          { id: "2", key: "ALPHA", name: "Alpha (tenant B)" },
          { id: "3", key: "BETA", name: "Beta" }
        ]
      }
    });

    deps = createDependencies({ databasePath: ":memory:", jiraClient: fakeJiraClient });
    app = await buildApp(deps);
    await app.ready();

    tenantA = await registerAndConnect(deps, "a@example.com", "code-a");
    tenantB = await registerAndConnect(deps, "b@example.com", "code-b");
  });

  afterEach(async () => {
    await app.close();
    deps.db.close();
  });

  it("requires an API key (401 UNAUTHENTICATED)", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/findings",
      payload: { projectKey: "ALPHA", title: "Stale account" }
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("UNAUTHENTICATED");
  });

  it("rejects an invalid API key (401)", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/findings",
      headers: { "x-api-key": "ih_not-a-real-key" },
      payload: { projectKey: "ALPHA", title: "Stale account" }
    });
    expect(response.statusCode).toBe(401);
  });

  it("accepts the key via the Authorization: Bearer header too", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/findings",
      headers: { authorization: `Bearer ${tenantA.apiKeySecret}` },
      payload: { projectKey: "ALPHA", title: "Stale account" }
    });
    expect(response.statusCode).toBe(201);
  });

  it("rejects unknown fields with 400 VALIDATION_ERROR", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/findings",
      headers: { "x-api-key": tenantA.apiKeySecret },
      payload: { projectKey: "ALPHA", title: "Stale account", bogus: true }
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a missing required field with 400", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/findings",
      headers: { "x-api-key": tenantA.apiKeySecret },
      payload: { title: "Stale account" }
    });
    expect(response.statusCode).toBe(400);
  });

  it("returns 422 PROJECT_NOT_FOUND for a project outside the tenant's connected workspace", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/findings",
      headers: { "x-api-key": tenantA.apiKeySecret },
      payload: { projectKey: "BETA", title: "Stale account" } // BETA only exists for tenant B
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe("PROJECT_NOT_FOUND");
  });

  it("creates a ticket for a valid project and key (201, well-formed body)", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/findings",
      headers: { "x-api-key": tenantA.apiKeySecret },
      payload: { projectKey: "alpha", title: "Stale service account: svc-deploy-prod", description: "Unused 90 days" }
    });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.projectKey).toBe("ALPHA");
    expect(body.source).toBe("api");
    expect(body.jiraIssueUrl).toBe("https://a.atlassian.net/browse/PROJ-1");
  });

  it("enforces tenant isolation: a key for tenant A cannot create against tenant B's distinct project", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/findings",
      headers: { "x-api-key": tenantA.apiKeySecret },
      payload: { projectKey: "BETA", title: "Stale account" }
    });
    expect(response.statusCode).toBe(422);
  });

  it("enforces tenant isolation: tenants with same-named projects only ever see their own tickets", async () => {
    const createA = await app.inject({
      method: "POST",
      url: "/api/v1/findings",
      headers: { "x-api-key": tenantA.apiKeySecret },
      payload: { projectKey: "ALPHA", title: "Tenant A finding" }
    });
    const createB = await app.inject({
      method: "POST",
      url: "/api/v1/findings",
      headers: { "x-api-key": tenantB.apiKeySecret },
      payload: { projectKey: "ALPHA", title: "Tenant B finding" }
    });
    expect(createA.statusCode).toBe(201);
    expect(createB.statusCode).toBe(201);

    const ticketsForA = await deps.ticketsService.listRecentTickets(tenantA.tenantId, "ALPHA");
    const ticketsForB = await deps.ticketsService.listRecentTickets(tenantB.tenantId, "ALPHA");

    expect(ticketsForA.map((t) => t.title)).toEqual(["Tenant A finding"]);
    expect(ticketsForB.map((t) => t.title)).toEqual(["Tenant B finding"]);
  });

  it("revoking tenant A's key does not affect tenant B's key", async () => {
    const keysForA = deps.apiKeysService.listApiKeys(tenantA.tenantId);
    const keyId = keysForA[0]?.id;
    if (!keyId) {
      throw new Error("test setup: tenant A has no api key on record");
    }
    deps.apiKeysService.revokeApiKey(tenantA.tenantId, keyId);

    const responseA = await app.inject({
      method: "POST",
      url: "/api/v1/findings",
      headers: { "x-api-key": tenantA.apiKeySecret },
      payload: { projectKey: "ALPHA", title: "Stale account" }
    });
    expect(responseA.statusCode).toBe(401);
    expect(responseA.json().error.code).toBe("API_KEY_REVOKED");

    const responseB = await app.inject({
      method: "POST",
      url: "/api/v1/findings",
      headers: { "x-api-key": tenantB.apiKeySecret },
      payload: { projectKey: "ALPHA", title: "Stale account" }
    });
    expect(responseB.statusCode).toBe(201);
  });

  it("returns 404 NOT_FOUND for an unknown route", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/does-not-exist" });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("NOT_FOUND");
  });

  it("rate limits a single API key independently of others", async () => {
    const lowLimitDeps = createDependencies({
      databasePath: ":memory:",
      jiraClient: createFakeJiraClient({
        projectsByCloudId: { "fake-cloud-id": [{ id: "1", key: "ALPHA", name: "Alpha" }] }
      })
    });
    lowLimitDeps.rateLimitMax = 2;
    const lowLimitApp = await buildApp(lowLimitDeps);
    await lowLimitApp.ready();

    const fixture = await registerAndConnect(lowLimitDeps, "rl@example.com", "fake-code");
    const otherFixture = await registerAndConnect(lowLimitDeps, "other@example.com", "fake-code");

    try {
      const first = await lowLimitApp.inject({
        method: "POST",
        url: "/api/v1/findings",
        headers: { "x-api-key": fixture.apiKeySecret },
        payload: { projectKey: "ALPHA", title: "1" }
      });
      const second = await lowLimitApp.inject({
        method: "POST",
        url: "/api/v1/findings",
        headers: { "x-api-key": fixture.apiKeySecret },
        payload: { projectKey: "ALPHA", title: "2" }
      });
      const third = await lowLimitApp.inject({
        method: "POST",
        url: "/api/v1/findings",
        headers: { "x-api-key": fixture.apiKeySecret },
        payload: { projectKey: "ALPHA", title: "3" }
      });
      expect([first.statusCode, second.statusCode]).toEqual([201, 201]);
      expect(third.statusCode).toBe(429);
      expect(third.json().error.code).toBe("RATE_LIMITED");

      // A different tenant's key has its own independent bucket.
      const otherResponse = await lowLimitApp.inject({
        method: "POST",
        url: "/api/v1/findings",
        headers: { "x-api-key": otherFixture.apiKeySecret },
        payload: { projectKey: "ALPHA", title: "1" }
      });
      expect(otherResponse.statusCode).toBe(201);
    } finally {
      await lowLimitApp.close();
      lowLimitDeps.db.close();
    }
  });
});
