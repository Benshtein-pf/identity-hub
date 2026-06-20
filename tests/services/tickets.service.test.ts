import { beforeEach, describe, expect, it } from "vitest";
import { createJiraOAuthService, type JiraOAuthService } from "../../src/services/jiraOAuth.service.js";
import { createJiraService, type JiraService } from "../../src/services/jira.service.js";
import { createTicketsService, type TicketsService } from "../../src/services/tickets.service.js";
import { createFakeJiraCredentialsRepository, createFakeTicketsRepository } from "../fakes/fakeRepositories.js";
import { createFakeJiraClient, type FakeJiraClient } from "../fakes/fakeJiraClient.js";

const ENCRYPTION_KEY = Buffer.alloc(32, 5);
const TENANT_A = "tenant-a";

function extractState(authorizeUrl: string): string {
  const state = new URL(authorizeUrl).searchParams.get("state");
  if (!state) {
    throw new Error("test setup: authorize URL had no state param");
  }
  return state;
}

describe("tickets.service", () => {
  let fakeJiraClient: FakeJiraClient;
  let jiraOAuth: JiraOAuthService;
  let jiraService: JiraService;
  let tickets: TicketsService;
  let currentTime: Date;

  beforeEach(async () => {
    currentTime = new Date("2026-01-01T00:00:00.000Z");
    fakeJiraClient = createFakeJiraClient({
      projectsByCloudId: { "fake-cloud-id": [{ id: "10000", key: "PROJ", name: "Project" }] },
      now: () => currentTime
    });
    jiraOAuth = createJiraOAuthService({
      jiraClient: fakeJiraClient,
      jiraCredentials: createFakeJiraCredentialsRepository(),
      encryptionKey: ENCRYPTION_KEY,
      clock: () => currentTime
    });
    jiraService = createJiraService({ jiraClient: fakeJiraClient, jiraOAuth });
    tickets = createTicketsService({
      tickets: createFakeTicketsRepository(),
      jiraClient: fakeJiraClient,
      jiraService,
      jiraOAuth,
      clock: () => currentTime
    });

    const authorizeUrl = jiraOAuth.connect(TENANT_A);
    await jiraOAuth.handleCallback({ state: extractState(authorizeUrl), code: "fake-code" });
  });

  it("creates a ticket and records it locally with a working Jira link", async () => {
    const ticket = await tickets.createTicket(TENANT_A, { projectKey: "PROJ", title: "Stale account" }, "ui");

    expect(ticket.projectKey).toBe("PROJ");
    expect(ticket.jiraIssueKey).toBe("PROJ-1");
    expect(ticket.source).toBe("ui");
    expect(ticket.jiraIssueUrl).toBe("https://fake.atlassian.net/browse/PROJ-1");
  });

  it("defaults the issue type to Task when none is given", async () => {
    await tickets.createTicket(TENANT_A, { projectKey: "PROJ", title: "Stale account" }, "ui");
    expect(fakeJiraClient.createIssueCalls[0]?.issueType).toBe("Task");
  });

  it("passes through an explicit issue type override", async () => {
    await tickets.createTicket(TENANT_A, { projectKey: "PROJ", title: "x", issueType: "Bug" }, "api");
    expect(fakeJiraClient.createIssueCalls[0]?.issueType).toBe("Bug");
  });

  it("normalizes project key casing against the connected workspace", async () => {
    const ticket = await tickets.createTicket(TENANT_A, { projectKey: "proj", title: "x" }, "ui");
    expect(ticket.projectKey).toBe("PROJ"); // canonical casing from Jira, not the caller's lowercase input
  });

  it("rejects a project that does not exist in the connected workspace with PROJECT_NOT_FOUND, without calling Jira's create-issue", async () => {
    await expect(
      tickets.createTicket(TENANT_A, { projectKey: "NOPE", title: "x" }, "ui")
    ).rejects.toMatchObject({ code: "PROJECT_NOT_FOUND" });
    expect(fakeJiraClient.createIssueCalls).toHaveLength(0);
  });

  it("rejects ticket creation when Jira is not connected for the tenant", async () => {
    await expect(
      tickets.createTicket("tenant-without-jira", { projectKey: "PROJ", title: "x" }, "ui")
    ).rejects.toMatchObject({ code: "JIRA_NOT_CONNECTED" });
  });

  it("lists the most recent tickets for a project, newest first, capped at 10", async () => {
    for (let i = 0; i < 12; i += 1) {
      currentTime = new Date(currentTime.getTime() + 1000);
      await tickets.createTicket(TENANT_A, { projectKey: "PROJ", title: `Finding ${i}` }, "ui");
    }

    const recent = await tickets.listRecentTickets(TENANT_A, "PROJ");
    expect(recent).toHaveLength(10);
    expect(recent[0]?.title).toBe("Finding 11"); // newest first
    expect(recent[9]?.title).toBe("Finding 2");
  });

  it("rejects listing recent tickets when Jira is not connected", async () => {
    await expect(tickets.listRecentTickets("tenant-without-jira", "PROJ")).rejects.toMatchObject({
      code: "JIRA_NOT_CONNECTED"
    });
  });
});
