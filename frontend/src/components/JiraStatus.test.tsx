/**
 * Tests for JiraStatus component.
 * Endpoint functions and AuthContext are both mocked.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { JiraStatus } from "./JiraStatus";
import { ApiError } from "../api/client";
import { makeJiraStatus } from "../test/factories";

vi.mock("../api/endpoints");
vi.mock("../auth/AuthContext", () => ({ useAuth: vi.fn() }));

import * as endpoints from "../api/endpoints";
import * as AuthModule from "../auth/AuthContext";

const mockClearSession = vi.fn();

beforeEach(() => {
  mockClearSession.mockReset();
  vi.mocked(AuthModule.useAuth).mockReturnValue({
    user: null,
    loading: false,
    clearSession: mockClearSession,
    doLogin: vi.fn(),
    doRegister: vi.fn(),
    doLogout: vi.fn()
  });
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe("JiraStatus — connected", () => {
  it("shows Connected status and siteUrl when connected", async () => {
    vi.mocked(endpoints.getJiraStatus).mockResolvedValueOnce(
      makeJiraStatus({ connected: true, siteUrl: "https://myco.atlassian.net" })
    );

    render(<JiraStatus />);

    await screen.findByText("Connected");
    expect(screen.getByText("https://myco.atlassian.net")).toBeInTheDocument();
  });

  it("shows Reconnect Jira button when connected", async () => {
    vi.mocked(endpoints.getJiraStatus).mockResolvedValueOnce(
      makeJiraStatus({ connected: true, siteUrl: "https://myco.atlassian.net" })
    );

    render(<JiraStatus />);

    await screen.findByRole("button", { name: "Reconnect Jira" });
  });

  it("calls onConnected when status is connected", async () => {
    vi.mocked(endpoints.getJiraStatus).mockResolvedValueOnce(
      makeJiraStatus({ connected: true, siteUrl: "https://myco.atlassian.net" })
    );
    const onConnected = vi.fn();

    render(<JiraStatus onConnected={onConnected} />);

    await waitFor(() => expect(onConnected).toHaveBeenCalledTimes(1));
  });
});

describe("JiraStatus — not connected", () => {
  it("shows Not connected status and Connect Jira button", async () => {
    vi.mocked(endpoints.getJiraStatus).mockResolvedValueOnce(
      makeJiraStatus({ connected: false })
    );

    render(<JiraStatus />);

    await screen.findByText("Not connected");
    expect(screen.getByRole("button", { name: "Connect Jira" })).toBeInTheDocument();
  });

  it("does not call onConnected when not connected", async () => {
    vi.mocked(endpoints.getJiraStatus).mockResolvedValueOnce(
      makeJiraStatus({ connected: false })
    );
    const onConnected = vi.fn();

    render(<JiraStatus onConnected={onConnected} />);

    await screen.findByText("Not connected");
    expect(onConnected).not.toHaveBeenCalled();
  });
});

describe("JiraStatus — errors", () => {
  it("calls clearSession on UNAUTHENTICATED", async () => {
    vi.mocked(endpoints.getJiraStatus).mockRejectedValueOnce(
      new ApiError("UNAUTHENTICATED", "Not logged in", 401)
    );

    render(<JiraStatus />);

    await waitFor(() => expect(mockClearSession).toHaveBeenCalledTimes(1));
  });

  it("shows the error message for other API errors", async () => {
    vi.mocked(endpoints.getJiraStatus).mockRejectedValueOnce(
      new ApiError("JIRA_UPSTREAM_ERROR", "Jira is unreachable", 502)
    );

    render(<JiraStatus />);

    await screen.findByText("Jira is unreachable");
  });

  it("shows a generic message for non-ApiError rejections", async () => {
    vi.mocked(endpoints.getJiraStatus).mockRejectedValueOnce(new TypeError("network"));

    render(<JiraStatus />);

    await screen.findByText("Could not load Jira connection status.");
  });

  it("Refresh button re-fetches the status", async () => {
    vi.mocked(endpoints.getJiraStatus)
      .mockResolvedValueOnce(makeJiraStatus({ connected: false }))
      .mockResolvedValueOnce(makeJiraStatus({ connected: true, siteUrl: "https://myco.atlassian.net" }));

    const user = userEvent.setup();
    render(<JiraStatus />);

    await screen.findByText("Not connected");
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    await screen.findByText("Connected");
  });
});
