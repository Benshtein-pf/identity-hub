/**
 * Tests for ApiKeysSection — reveal-once secret, list, revoke, and auth error.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiKeysSection } from "./ApiKeysSection";
import { ApiError } from "../api/client";
import {
  makeApiKey,
  makeListApiKeysResponse,
  makeCreateApiKeyResponse
} from "../test/factories";

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
  // Default: empty list
  vi.mocked(endpoints.listApiKeys).mockResolvedValue(
    makeListApiKeysResponse([])
  );
});

function renderApiKeys() {
  const user = userEvent.setup();
  render(<ApiKeysSection />);
  return user;
}

// ── key list ──────────────────────────────────────────────────────────────────

describe("ApiKeysSection — key list", () => {
  it("shows 'No API keys yet.' when the list is empty", async () => {
    renderApiKeys();
    await screen.findByText("No API keys yet.");
  });

  it("renders active and revoked keys with correct status badges", async () => {
    const active = makeApiKey({ name: "scanner-ci", revokedAt: null });
    const revoked = makeApiKey({ name: "old-key", revokedAt: "2024-06-01T00:00:00.000Z" });
    vi.mocked(endpoints.listApiKeys).mockResolvedValueOnce(
      makeListApiKeysResponse([active, revoked])
    );

    renderApiKeys();

    await screen.findByText("scanner-ci");
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Revoked")).toBeInTheDocument();
  });

  it("renders the key prefix with trailing ellipsis", async () => {
    const key = makeApiKey({ keyPrefix: "abc123" });
    vi.mocked(endpoints.listApiKeys).mockResolvedValueOnce(
      makeListApiKeysResponse([key])
    );

    renderApiKeys();

    await screen.findByText("abc123...");
  });
});

// ── create key — reveal secret once ──────────────────────────────────────────

describe("ApiKeysSection — create key", () => {
  it("reveals the raw secret exactly once in the amber panel after creation", async () => {
    vi.mocked(endpoints.listApiKeys).mockResolvedValue(makeListApiKeysResponse([]));
    vi.mocked(endpoints.createApiKey).mockResolvedValueOnce(
      makeCreateApiKeyResponse("super-secret-raw-value", { name: "my-key" })
    );

    const user = renderApiKeys();
    await screen.findByText("No API keys yet.");

    await user.click(screen.getByRole("button", { name: "Create key" }));

    // The amber reveal panel must appear
    await screen.findByText("Copy this secret now. It will never be shown again.");
    expect(screen.getByText("super-secret-raw-value")).toBeInTheDocument();
  });

  it("hides the secret panel after Dismiss is clicked", async () => {
    vi.mocked(endpoints.listApiKeys).mockResolvedValue(makeListApiKeysResponse([]));
    vi.mocked(endpoints.createApiKey).mockResolvedValueOnce(
      makeCreateApiKeyResponse("the-secret")
    );

    const user = renderApiKeys();
    await screen.findByText("No API keys yet.");
    await user.click(screen.getByRole("button", { name: "Create key" }));
    await screen.findByText("Copy this secret now. It will never be shown again.");

    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(
      screen.queryByText("Copy this secret now. It will never be shown again.")
    ).not.toBeInTheDocument();
    expect(screen.queryByText("the-secret")).not.toBeInTheDocument();
  });

  it("Copy button writes the secret to the clipboard and shows Copied!", async () => {
    // navigator.clipboard is stubbed in setup.ts; spy on writeText for this test
    const writeTextSpy = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined);

    vi.mocked(endpoints.listApiKeys).mockResolvedValue(makeListApiKeysResponse([]));
    vi.mocked(endpoints.createApiKey).mockResolvedValueOnce(
      makeCreateApiKeyResponse("clipboard-secret")
    );

    const user = renderApiKeys();
    await screen.findByText("No API keys yet.");
    await user.click(screen.getByRole("button", { name: "Create key" }));
    await screen.findByText("Copy this secret now. It will never be shown again.");

    await user.click(screen.getByRole("button", { name: "Copy" }));

    // copySecret is fire-and-forget (void), so wait for the async write to settle
    await waitFor(() =>
      expect(writeTextSpy).toHaveBeenCalledWith("clipboard-secret")
    );
    await screen.findByRole("button", { name: "Copied!" });

    writeTextSpy.mockRestore();
  });
});

// ── revoke key ────────────────────────────────────────────────────────────────

describe("ApiKeysSection — revoke key", () => {
  it("removes the key row after successful revocation", async () => {
    const key = makeApiKey({ name: "scanner-ci", revokedAt: null });
    vi.mocked(endpoints.listApiKeys).mockResolvedValueOnce(
      makeListApiKeysResponse([key])
    );
    vi.mocked(endpoints.deleteApiKey).mockResolvedValueOnce(undefined);

    const user = renderApiKeys();
    await screen.findByText("scanner-ci");

    await user.click(screen.getByRole("button", { name: "Revoke" }));

    await waitFor(() =>
      expect(screen.queryByText("scanner-ci")).not.toBeInTheDocument()
    );
    expect(vi.mocked(endpoints.deleteApiKey)).toHaveBeenCalledWith(key.id);
  });

  it("does not render a Revoke button for already-revoked keys", async () => {
    const revoked = makeApiKey({ revokedAt: "2024-01-01T00:00:00.000Z" });
    vi.mocked(endpoints.listApiKeys).mockResolvedValueOnce(
      makeListApiKeysResponse([revoked])
    );

    renderApiKeys();

    await screen.findByText("Revoked");
    expect(screen.queryByRole("button", { name: "Revoke" })).not.toBeInTheDocument();
  });
});

// ── auth errors ───────────────────────────────────────────────────────────────

describe("ApiKeysSection — auth errors", () => {
  it("calls clearSession when listApiKeys returns UNAUTHENTICATED", async () => {
    vi.mocked(endpoints.listApiKeys).mockRejectedValueOnce(
      new ApiError("UNAUTHENTICATED", "Not logged in", 401)
    );

    renderApiKeys();

    await waitFor(() => expect(mockClearSession).toHaveBeenCalledTimes(1));
  });

  it("calls clearSession when createApiKey returns UNAUTHENTICATED", async () => {
    vi.mocked(endpoints.listApiKeys).mockResolvedValue(makeListApiKeysResponse([]));
    vi.mocked(endpoints.createApiKey).mockRejectedValueOnce(
      new ApiError("UNAUTHENTICATED", "Not logged in", 401)
    );

    const user = renderApiKeys();
    await screen.findByText("No API keys yet.");
    await user.click(screen.getByRole("button", { name: "Create key" }));

    await waitFor(() => expect(mockClearSession).toHaveBeenCalledTimes(1));
  });
});

// ── within helper usage ────────────────────────────────────────────────────────

describe("ApiKeysSection — multiple keys", () => {
  it("only the active key has a Revoke button; the revoked key does not", async () => {
    const active = makeApiKey({ name: "active-key", revokedAt: null });
    const revoked = makeApiKey({ name: "old-key", revokedAt: "2024-01-01T00:00:00.000Z" });
    vi.mocked(endpoints.listApiKeys).mockResolvedValueOnce(
      makeListApiKeysResponse([active, revoked])
    );

    renderApiKeys();

    await screen.findByText("active-key");

    const rows = screen.getAllByRole("row").slice(1); // skip header row
    const activeRow = rows.find((r) => within(r).queryByText("active-key"));
    const revokedRow = rows.find((r) => within(r).queryByText("old-key"));

    expect(activeRow).toBeDefined();
    expect(revokedRow).toBeDefined();
    if (activeRow) expect(within(activeRow).getByRole("button", { name: "Revoke" })).toBeInTheDocument();
    if (revokedRow) expect(within(revokedRow).queryByRole("button", { name: "Revoke" })).not.toBeInTheDocument();
  });
});
