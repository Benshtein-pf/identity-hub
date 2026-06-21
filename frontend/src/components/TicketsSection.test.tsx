/**
 * Tests for TicketsSection — project loading, ticket creation, error-code
 * handling, and the silent dropdown refetch (hasLoadedProjects guard).
 *
 * TicketsSection has two "Project" comboboxes (create-project and recent-project),
 * both labeled "Project". Tests use getAllByRole(...)[0] for the create-project
 * select and [1] for the recent-project select, matching their DOM order.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TicketsSection } from "./TicketsSection";
import { ApiError } from "../api/client";
import {
  makeProject,
  makeProjectsResponse,
  makeRecentTicketsResponse,
  makeTicket
} from "../test/factories";

vi.mock("../api/endpoints");
vi.mock("../auth/AuthContext", () => ({ useAuth: vi.fn() }));

import * as endpoints from "../api/endpoints";
import * as AuthModule from "../auth/AuthContext";

const mockClearSession = vi.fn();
const mockOnGoToJira = vi.fn();

beforeEach(() => {
  mockClearSession.mockReset();
  mockOnGoToJira.mockReset();
  vi.mocked(AuthModule.useAuth).mockReturnValue({
    user: null,
    loading: false,
    clearSession: mockClearSession,
    doLogin: vi.fn(),
    doRegister: vi.fn(),
    doLogout: vi.fn()
  });
  vi.mocked(endpoints.getRecentTickets).mockResolvedValue(
    makeRecentTicketsResponse([])
  );
});

function renderTickets() {
  const user = userEvent.setup();
  render(<TicketsSection onGoToJira={mockOnGoToJira} />);
  return user;
}

/** Wait for the project dropdowns to be rendered (initial load complete). */
async function waitForProjects(): Promise<void> {
  await waitFor(() => {
    expect(screen.getAllByRole("combobox", { name: /project/i })).toHaveLength(2);
  });
}

/** Returns the create-project combobox (first in DOM order). */
function createProjectSelect(): HTMLElement {
  const selects = screen.getAllByRole("combobox", { name: /project/i });
  if (!selects[0]) throw new Error("create-project select not found");
  return selects[0];
}

// ── initial project load ──────────────────────────────────────────────────────

describe("TicketsSection — project loading", () => {
  it("populates both project dropdowns after mount", async () => {
    const projA = makeProject({ key: "ALPHA", name: "Alpha" });
    const projB = makeProject({ key: "BETA", name: "Beta" });
    vi.mocked(endpoints.getJiraProjects).mockResolvedValueOnce(
      makeProjectsResponse([projA, projB])
    );

    renderTickets();

    await waitFor(() => {
      expect(screen.getAllByRole("option", { name: /alpha/i })).toHaveLength(2);
    });
    expect(screen.getAllByRole("option", { name: /beta/i })).toHaveLength(2);
  });

  it("shows Jira-not-connected prompt when JIRA_NOT_CONNECTED is returned", async () => {
    vi.mocked(endpoints.getJiraProjects).mockRejectedValueOnce(
      new ApiError("JIRA_NOT_CONNECTED", "Jira not connected", 409)
    );

    renderTickets();

    await screen.findByText(/jira is not connected/i);
    expect(screen.getByRole("button", { name: /connect jira/i })).toBeInTheDocument();
  });

  it("calls onGoToJira when the Connect Jira button is clicked", async () => {
    vi.mocked(endpoints.getJiraProjects).mockRejectedValueOnce(
      new ApiError("JIRA_NOT_CONNECTED", "Jira not connected", 409)
    );

    const user = renderTickets();
    await screen.findByText(/jira is not connected/i);
    await user.click(screen.getByRole("button", { name: /connect jira/i }));
    expect(mockOnGoToJira).toHaveBeenCalledTimes(1);
  });
});

// ── create ticket — success ───────────────────────────────────────────────────

describe("TicketsSection — create ticket (success)", () => {
  it("shows the success banner with issue key and hyphen separator (no em dash)", async () => {
    const proj = makeProject({ key: "PROJ1", name: "Project One" });
    vi.mocked(endpoints.getJiraProjects).mockResolvedValue(
      makeProjectsResponse([proj])
    );
    const ticket = makeTicket({
      projectKey: "PROJ1",
      jiraIssueKey: "PROJ1-42",
      title: "Stale service account",
      jiraIssueUrl: "https://example.atlassian.net/browse/PROJ1-42"
    });
    vi.mocked(endpoints.createTicket).mockResolvedValueOnce(ticket);
    vi.mocked(endpoints.getRecentTickets).mockResolvedValue(
      makeRecentTicketsResponse([ticket])
    );

    const user = renderTickets();

    // Wait for projects to load
    await waitForProjects();
    await user.type(screen.getByLabelText(/title/i), "Stale service account");
    await user.click(screen.getByRole("button", { name: /create ticket/i }));

    await screen.findByText(/ticket created/i);

    expect(screen.getByRole("link", { name: "PROJ1-42" })).toHaveAttribute(
      "href",
      "https://example.atlassian.net/browse/PROJ1-42"
    );

    // Separator must be a hyphen (guards the em-dash fix)
    expect(document.body.textContent).toContain(" - Stale service account");
    expect(document.body.textContent).not.toContain("—"); // em dash U+2014
  });

  it("clears title and description after successful creation", async () => {
    const proj = makeProject({ key: "PROJ1", name: "Project One" });
    vi.mocked(endpoints.getJiraProjects).mockResolvedValue(
      makeProjectsResponse([proj])
    );
    vi.mocked(endpoints.createTicket).mockResolvedValueOnce(makeTicket());

    const user = renderTickets();
    await waitForProjects();
    const titleInput = screen.getByLabelText(/title/i);
    await user.type(titleInput, "My finding");
    await user.click(screen.getByRole("button", { name: /create ticket/i }));

    await screen.findByText(/ticket created/i);
    expect(titleInput).toHaveValue("");
  });
});

// ── create ticket — error codes ───────────────────────────────────────────────

describe("TicketsSection — create ticket (errors)", () => {
  beforeEach(() => {
    const proj = makeProject({ key: "PROJ1", name: "Project One" });
    vi.mocked(endpoints.getJiraProjects).mockResolvedValue(
      makeProjectsResponse([proj])
    );
  });

  it("shows an inline field error for PROJECT_NOT_FOUND", async () => {
    vi.mocked(endpoints.createTicket).mockRejectedValueOnce(
      new ApiError("PROJECT_NOT_FOUND", "Project PROJ1 not found in your workspace.", 422)
    );

    const user = renderTickets();
    await waitForProjects();
    await user.type(screen.getByLabelText(/title/i), "ticket");
    await user.click(screen.getByRole("button", { name: /create ticket/i }));

    await screen.findByText("Project PROJ1 not found in your workspace.");
  });

  it("shows a rate-limited banner for RATE_LIMITED", async () => {
    vi.mocked(endpoints.createTicket).mockRejectedValueOnce(
      new ApiError("RATE_LIMITED", "Rate limited", 429)
    );

    const user = renderTickets();
    await waitForProjects();
    await user.type(screen.getByLabelText(/title/i), "ticket");
    await user.click(screen.getByRole("button", { name: /create ticket/i }));

    await screen.findByText("Too many requests. Please try again shortly.");
  });

  it("shows a Jira-unavailable banner for JIRA_UPSTREAM_ERROR", async () => {
    vi.mocked(endpoints.createTicket).mockRejectedValueOnce(
      new ApiError("JIRA_UPSTREAM_ERROR", "Jira error", 502)
    );

    const user = renderTickets();
    await waitForProjects();
    await user.type(screen.getByLabelText(/title/i), "ticket");
    await user.click(screen.getByRole("button", { name: /create ticket/i }));

    await screen.findByText("Jira is unavailable right now. Please try again later.");
  });

  it("calls clearSession for UNAUTHENTICATED on ticket create", async () => {
    vi.mocked(endpoints.createTicket).mockRejectedValueOnce(
      new ApiError("UNAUTHENTICATED", "Not logged in", 401)
    );

    const user = renderTickets();
    await waitForProjects();
    await user.type(screen.getByLabelText(/title/i), "ticket");
    await user.click(screen.getByRole("button", { name: /create ticket/i }));

    await waitFor(() => expect(mockClearSession).toHaveBeenCalledTimes(1));
  });
});

// ── dropdown refetch guard ────────────────────────────────────────────────────

describe("TicketsSection — dropdown refetch (hasLoadedProjects guard)", () => {
  it("adds a newly-available project without showing the loading placeholder", async () => {
    const projA = makeProject({ key: "ALPHA", name: "Alpha" });
    const projB = makeProject({ key: "BETA", name: "Beta" });

    vi.mocked(endpoints.getJiraProjects)
      .mockResolvedValueOnce(makeProjectsResponse([projA, projB]))
      .mockResolvedValue(
        makeProjectsResponse([projA, projB, makeProject({ key: "GAMMA", name: "Gamma" })])
      );

    const user = renderTickets();

    // Wait for initial load: Alpha and Beta appear in both dropdowns
    await waitFor(() =>
      expect(screen.getAllByRole("option", { name: /alpha/i })).toHaveLength(2)
    );

    // Click the create-project dropdown — triggers a background refetch
    await user.click(createProjectSelect());

    // The "Loading projects..." placeholder must NOT appear during the silent refresh
    expect(screen.queryByText("Loading projects...")).not.toBeInTheDocument();

    // Gamma should appear after the refetch resolves
    await waitFor(() =>
      expect(screen.getAllByRole("option", { name: /gamma/i })).toHaveLength(2)
    );
  });
});
