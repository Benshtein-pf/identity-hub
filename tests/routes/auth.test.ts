import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp, createDependencies, type AppDependencies } from "../../src/app.js";
import { createFakeJiraClient } from "../fakes/fakeJiraClient.js";

const COOKIE_NAME = "ih_session";

function extractCookie(headers: Record<string, string | string[] | undefined>): string | undefined {
  const setCookie = headers["set-cookie"];
  if (!setCookie) return undefined;
  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
  const found = cookies.find((c) => c.startsWith(`${COOKIE_NAME}=`));
  return found;
}

describe("auth routes", () => {
  let app: FastifyInstance;
  let deps: AppDependencies;

  beforeEach(async () => {
    deps = createDependencies({ databasePath: ":memory:", jiraClient: createFakeJiraClient() });
    app = await buildApp(deps);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    deps.db.close();
  });

  describe("POST /api/auth/register", () => {
    it("creates a user and returns 201 with a session cookie", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: { email: "user@example.com", password: "correct-password" }
      });
      expect(response.statusCode).toBe(201);
      expect(response.json().user.email).toBe("user@example.com");
      expect(extractCookie(response.headers)).toBeDefined();
    });

    it("returns 409 EMAIL_TAKEN for a duplicate email", async () => {
      await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: { email: "user@example.com", password: "correct-password" }
      });
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: { email: "user@example.com", password: "another-password" }
      });
      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe("EMAIL_TAKEN");
    });

    it("returns 400 VALIDATION_ERROR for missing fields", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: { email: "user@example.com" }
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 400 VALIDATION_ERROR for unknown fields", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: { email: "user@example.com", password: "correct-password", bogus: true }
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("POST /api/auth/login", () => {
    beforeEach(async () => {
      await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: { email: "user@example.com", password: "correct-password" }
      });
    });

    it("returns 200 with a session cookie on valid credentials", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: "user@example.com", password: "correct-password" }
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().user.email).toBe("user@example.com");
      expect(extractCookie(response.headers)).toBeDefined();
    });

    it("returns 401 INVALID_CREDENTIALS for wrong password", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: "user@example.com", password: "wrong-password" }
      });
      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe("INVALID_CREDENTIALS");
    });

    it("returns 401 INVALID_CREDENTIALS for unknown email (same error as wrong password)", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: "nobody@example.com", password: "correct-password" }
      });
      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe("INVALID_CREDENTIALS");
    });
  });

  describe("GET /api/auth/me", () => {
    it("returns 401 when not authenticated", async () => {
      const response = await app.inject({ method: "GET", url: "/api/auth/me" });
      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe("UNAUTHENTICATED");
    });

    it("returns the current user when authenticated", async () => {
      const registerResponse = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: { email: "user@example.com", password: "correct-password" }
      });
      const cookieHeader = extractCookie(registerResponse.headers);
      const cookieValue = cookieHeader?.split(";")[0]; // "ih_session=<value>"

      const response = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: { cookie: cookieValue }
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().user.email).toBe("user@example.com");
    });
  });

  describe("POST /api/auth/logout", () => {
    it("returns 401 when not authenticated", async () => {
      const response = await app.inject({ method: "POST", url: "/api/auth/logout" });
      expect(response.statusCode).toBe(401);
    });

    it("returns 204 and clears the session cookie", async () => {
      const registerResponse = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: { email: "user@example.com", password: "correct-password" }
      });
      const cookieHeader = extractCookie(registerResponse.headers);
      const cookieValue = cookieHeader?.split(";")[0];

      const logoutResponse = await app.inject({
        method: "POST",
        url: "/api/auth/logout",
        headers: { cookie: cookieValue }
      });
      expect(logoutResponse.statusCode).toBe(204);

      // The cookie should now be gone: subsequent /me must 401.
      const meResponse = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: { cookie: cookieValue }
      });
      expect(meResponse.statusCode).toBe(401);
    });
  });
});
