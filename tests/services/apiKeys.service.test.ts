import { beforeEach, describe, expect, it } from "vitest";
import { createApiKeysService, type ApiKeysService } from "../../src/services/apiKeys.service.js";
import { createFakeApiKeysRepository } from "../fakes/fakeRepositories.js";

describe("apiKeys.service", () => {
  let currentTime: Date;
  let apiKeys: ApiKeysService;
  const TENANT_A = "tenant-a";
  const TENANT_B = "tenant-b";

  beforeEach(() => {
    currentTime = new Date("2026-01-01T00:00:00.000Z");
    apiKeys = createApiKeysService({ apiKeys: createFakeApiKeysRepository(), clock: () => currentTime });
  });

  it("creates a key whose raw secret is shown once and never stored", () => {
    const { apiKey, secret } = apiKeys.createApiKey(TENANT_A, { name: "CI key" });
    expect(secret).toMatch(/^ih_/);
    expect(apiKey.name).toBe("CI key");
    expect(JSON.stringify(apiKey)).not.toContain(secret);
  });

  it("defaults the name when none is given", () => {
    const { apiKey } = apiKeys.createApiKey(TENANT_A, {});
    expect(apiKey.name).toBe("Unnamed key");
  });

  it("resolves a freshly created key back to its tenant", () => {
    const { secret } = apiKeys.createApiKey(TENANT_A, {});
    const resolved = apiKeys.resolveByRawKey(secret);
    expect(resolved.tenantId).toBe(TENANT_A);
  });

  it("rejects an unknown key", () => {
    expect(() => apiKeys.resolveByRawKey("ih_not-a-real-key")).toThrowError(
      expect.objectContaining({ code: "UNAUTHENTICATED" })
    );
  });

  it("lists keys scoped to a tenant, without ever including the raw secret", () => {
    apiKeys.createApiKey(TENANT_A, { name: "A1" });
    apiKeys.createApiKey(TENANT_B, { name: "B1" });

    const listA = apiKeys.listApiKeys(TENANT_A);
    expect(listA).toHaveLength(1);
    expect(listA[0]?.name).toBe("A1");
    expect(listA.every((key) => !("secret" in key))).toBe(true);
  });

  it("revokes a key so it can no longer authenticate", () => {
    const { apiKey, secret } = apiKeys.createApiKey(TENANT_A, {});
    apiKeys.revokeApiKey(TENANT_A, apiKey.id);

    expect(() => apiKeys.resolveByRawKey(secret)).toThrowError(expect.objectContaining({ code: "API_KEY_REVOKED" }));
  });

  it("revoking an already-revoked key is idempotent (no error)", () => {
    const { apiKey } = apiKeys.createApiKey(TENANT_A, {});
    apiKeys.revokeApiKey(TENANT_A, apiKey.id);
    expect(() => apiKeys.revokeApiKey(TENANT_A, apiKey.id)).not.toThrow();
  });

  it("revoking a key that does not belong to the caller's tenant is reported as not found", () => {
    const { apiKey } = apiKeys.createApiKey(TENANT_A, {});
    expect(() => apiKeys.revokeApiKey(TENANT_B, apiKey.id)).toThrowError(expect.objectContaining({ code: "NOT_FOUND" }));
  });

  it("rejects a key once its optional expiry has passed", () => {
    const { secret } = apiKeys.createApiKey(TENANT_A, { expiresAt: "2026-01-02T00:00:00.000Z" });

    currentTime = new Date("2026-01-03T00:00:00.000Z"); // past expiry
    expect(() => apiKeys.resolveByRawKey(secret)).toThrowError(expect.objectContaining({ code: "API_KEY_EXPIRED" }));
  });

  it("does not force-expire a key with no expiresAt set", () => {
    const { secret } = apiKeys.createApiKey(TENANT_A, {});
    currentTime = new Date("2030-01-01T00:00:00.000Z"); // years later
    expect(() => apiKeys.resolveByRawKey(secret)).not.toThrow();
  });

  it("records lastUsedAt when a key successfully authenticates", () => {
    const { apiKey, secret } = apiKeys.createApiKey(TENANT_A, {});
    expect(apiKey.lastUsedAt).toBeNull();

    apiKeys.resolveByRawKey(secret);

    const [refreshed] = apiKeys.listApiKeys(TENANT_A);
    expect(refreshed?.lastUsedAt).toBe(currentTime.toISOString());
  });
});
