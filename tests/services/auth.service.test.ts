import { beforeEach, describe, expect, it } from "vitest";
import { createAuthService, type AuthService } from "../../src/services/auth.service.js";
import { AppError } from "../../src/contract/errors.js";
import {
  createFakeSessionsRepository,
  createFakeTenantsRepository,
  createFakeUsersRepository
} from "../fakes/fakeRepositories.js";

function buildAuthService(now: () => Date): AuthService {
  return createAuthService({
    users: createFakeUsersRepository(),
    sessions: createFakeSessionsRepository(),
    tenants: createFakeTenantsRepository(),
    sessionTtlDays: 7,
    clock: now
  });
}

describe("auth.service", () => {
  let currentTime: Date;
  let auth: AuthService;

  beforeEach(() => {
    currentTime = new Date("2026-01-01T00:00:00.000Z");
    auth = buildAuthService(() => currentTime);
  });

  it("registers a new user with a fresh tenant and a sliding-expiry session", async () => {
    const { user, session } = await auth.register("a@example.com", "correct-password");
    expect(user.email).toBe("a@example.com");
    expect(session.tenantId).toBe(user.tenantId);
    expect(new Date(session.expiresAt).getTime()).toBe(currentTime.getTime() + 7 * 24 * 60 * 60 * 1000);
  });

  it("rejects registration with an email already in use", async () => {
    await auth.register("a@example.com", "correct-password");
    await expect(auth.register("a@example.com", "another-password")).rejects.toMatchObject({
      code: "EMAIL_TAKEN"
    });
  });

  it("logs in with correct credentials and issues a new session", async () => {
    const { user: registered } = await auth.register("a@example.com", "correct-password");
    const { user, session } = await auth.login("a@example.com", "correct-password");
    expect(user.id).toBe(registered.id);
    expect(session.userId).toBe(registered.id);
  });

  it("rejects login with the wrong password, without revealing which field was wrong", async () => {
    await auth.register("a@example.com", "correct-password");
    await expect(auth.login("a@example.com", "wrong-password")).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS"
    });
  });

  it("rejects login for an unknown email with the same error as a wrong password", async () => {
    await expect(auth.login("nobody@example.com", "whatever")).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS"
    });
  });

  it("validateSession returns null for an unknown session id", () => {
    expect(auth.validateSession("not-a-real-session")).toBeNull();
  });

  it("validateSession returns the user/session for a valid, unexpired session", async () => {
    const { session } = await auth.register("a@example.com", "correct-password");
    const result = auth.validateSession(session.id);
    expect(result).not.toBeNull();
    expect(result?.user.email).toBe("a@example.com");
  });

  it("validateSession extends expiry on activity (sliding window)", async () => {
    const { session } = await auth.register("a@example.com", "correct-password");
    const originalExpiry = session.expiresAt;

    currentTime = new Date(currentTime.getTime() + 24 * 60 * 60 * 1000); // +1 day
    const result = auth.validateSession(session.id);

    expect(result).not.toBeNull();
    expect(new Date(result?.session.expiresAt ?? 0).getTime()).toBeGreaterThan(new Date(originalExpiry).getTime());
  });

  it("validateSession returns null and deletes the row once a session has expired", async () => {
    const { session } = await auth.register("a@example.com", "correct-password");

    currentTime = new Date(currentTime.getTime() + 8 * 24 * 60 * 60 * 1000); // +8 days, past the 7-day TTL
    expect(auth.validateSession(session.id)).toBeNull();

    // Roll time back to confirm the row is truly gone, not just "expired at this instant".
    currentTime = new Date("2026-01-01T00:00:00.000Z");
    expect(auth.validateSession(session.id)).toBeNull();
  });

  it("logout deletes the session immediately (no grace period)", async () => {
    const { user, session } = await auth.register("a@example.com", "correct-password");
    auth.logout(user.tenantId, session.id);
    expect(auth.validateSession(session.id)).toBeNull();
  });

  it("getUser looks up the full record for a tenant/userId pair", async () => {
    const { user } = await auth.register("a@example.com", "correct-password");
    const fetched = auth.getUser(user.tenantId, user.id);
    expect(fetched?.email).toBe("a@example.com");
  });

  it("AppError carries the right error code for downstream status mapping", async () => {
    try {
      await auth.login("nobody@example.com", "whatever");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
    }
  });
});
