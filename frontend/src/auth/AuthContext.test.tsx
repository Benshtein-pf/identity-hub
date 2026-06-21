/**
 * Unit tests for AuthProvider / useAuth.
 * All API endpoint functions are auto-mocked so no real network calls are made.
 */
import { render, screen, waitFor, act } from "@testing-library/react";
import { AuthProvider, useAuth } from "./AuthContext";
import { ApiError } from "../api/client";
import { makeAuthResponse, makeUser } from "../test/factories";

vi.mock("../api/endpoints");
import * as endpoints from "../api/endpoints";

// ── helpers ───────────────────────────────────────────────────────────────────

function Wrapper({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

function EmailDisplay() {
  const { user, loading } = useAuth();
  return (
    <div>
      <span data-testid="email">{user?.email ?? "none"}</span>
      <span data-testid="loading">{loading ? "loading" : "ready"}</span>
    </div>
  );
}

// ── initial load ──────────────────────────────────────────────────────────────

describe("AuthProvider — initial load", () => {
  it("starts loading and populates user on successful getMe", async () => {
    vi.mocked(endpoints.getMe).mockResolvedValueOnce(
      makeAuthResponse({ user: makeUser({ email: "alice@example.com" }) })
    );

    render(<EmailDisplay />, { wrapper: Wrapper });

    expect(screen.getByTestId("loading")).toHaveTextContent("loading");
    await waitFor(() =>
      expect(screen.getByTestId("loading")).toHaveTextContent("ready")
    );
    expect(screen.getByTestId("email")).toHaveTextContent("alice@example.com");
  });

  it("leaves user null and finishes loading when getMe rejects", async () => {
    vi.mocked(endpoints.getMe).mockRejectedValueOnce(
      new ApiError("UNAUTHENTICATED", "no session", 401)
    );

    render(<EmailDisplay />, { wrapper: Wrapper });

    await waitFor(() =>
      expect(screen.getByTestId("loading")).toHaveTextContent("ready")
    );
    expect(screen.getByTestId("email")).toHaveTextContent("none");
  });
});

// ── doLogin ───────────────────────────────────────────────────────────────────

describe("AuthProvider — doLogin", () => {
  it("sets the user from the auth response", async () => {
    vi.mocked(endpoints.getMe).mockRejectedValueOnce(
      new ApiError("UNAUTHENTICATED", "no session", 401)
    );
    vi.mocked(endpoints.login).mockResolvedValueOnce(
      makeAuthResponse({ user: makeUser({ email: "bob@example.com" }) })
    );

    function LoginTrigger() {
      const { user, doLogin } = useAuth();
      return (
        <div>
          <span data-testid="email">{user?.email ?? "none"}</span>
          <button onClick={() => { void doLogin("bob@example.com", "pass"); }}>login</button>
        </div>
      );
    }

    render(<LoginTrigger />, { wrapper: Wrapper });
    await waitFor(() =>
      expect(screen.getByTestId("email")).toHaveTextContent("none")
    );

    await act(async () => {
      screen.getByRole("button", { name: "login" }).click();
    });
    await waitFor(() =>
      expect(screen.getByTestId("email")).toHaveTextContent("bob@example.com")
    );
  });
});

// ── doRegister ────────────────────────────────────────────────────────────────

describe("AuthProvider — doRegister", () => {
  it("sets the user from the auth response", async () => {
    vi.mocked(endpoints.getMe).mockRejectedValueOnce(
      new ApiError("UNAUTHENTICATED", "no session", 401)
    );
    vi.mocked(endpoints.register).mockResolvedValueOnce(
      makeAuthResponse({ user: makeUser({ email: "carol@example.com" }) })
    );

    function RegisterTrigger() {
      const { user, doRegister } = useAuth();
      return (
        <div>
          <span data-testid="email">{user?.email ?? "none"}</span>
          <button
            onClick={() => { void doRegister("carol@example.com", "password123"); }}
          >
            register
          </button>
        </div>
      );
    }

    render(<RegisterTrigger />, { wrapper: Wrapper });
    await waitFor(() =>
      expect(screen.getByTestId("email")).toHaveTextContent("none")
    );

    await act(async () => {
      screen.getByRole("button", { name: "register" }).click();
    });
    await waitFor(() =>
      expect(screen.getByTestId("email")).toHaveTextContent("carol@example.com")
    );
  });
});

// ── doLogout ──────────────────────────────────────────────────────────────────

describe("AuthProvider — doLogout", () => {
  it("calls logout() and clears the user on success", async () => {
    vi.mocked(endpoints.getMe).mockResolvedValueOnce(
      makeAuthResponse({ user: makeUser({ email: "dave@example.com" }) })
    );
    vi.mocked(endpoints.logout).mockResolvedValueOnce(undefined);

    function LogoutTrigger() {
      const { user, doLogout } = useAuth();
      return (
        <div>
          <span data-testid="email">{user?.email ?? "none"}</span>
          <button onClick={() => { void doLogout(); }}>logout</button>
        </div>
      );
    }

    render(<LogoutTrigger />, { wrapper: Wrapper });
    await waitFor(() =>
      expect(screen.getByTestId("email")).toHaveTextContent("dave@example.com")
    );

    await act(async () => {
      screen.getByRole("button", { name: "logout" }).click();
    });
    await waitFor(() =>
      expect(screen.getByTestId("email")).toHaveTextContent("none")
    );
    expect(vi.mocked(endpoints.logout)).toHaveBeenCalledTimes(1);
  });

  it("swallows an ApiError from logout but still clears the user", async () => {
    vi.mocked(endpoints.getMe).mockResolvedValueOnce(
      makeAuthResponse({ user: makeUser({ email: "eve@example.com" }) })
    );
    vi.mocked(endpoints.logout).mockRejectedValueOnce(
      new ApiError("UNAUTHENTICATED", "already gone", 401)
    );

    function LogoutTrigger() {
      const { user, doLogout } = useAuth();
      return (
        <div>
          <span data-testid="email">{user?.email ?? "none"}</span>
          <button onClick={() => { void doLogout(); }}>logout</button>
        </div>
      );
    }

    render(<LogoutTrigger />, { wrapper: Wrapper });
    await waitFor(() =>
      expect(screen.getByTestId("email")).toHaveTextContent("eve@example.com")
    );

    await act(async () => {
      screen.getByRole("button", { name: "logout" }).click();
    });
    // User is cleared even though logout() threw
    await waitFor(() =>
      expect(screen.getByTestId("email")).toHaveTextContent("none")
    );
  });

  it("re-throws a non-ApiError from logout", async () => {
    vi.mocked(endpoints.getMe).mockResolvedValueOnce(makeAuthResponse());
    const networkErr = new TypeError("network failure");
    vi.mocked(endpoints.logout).mockRejectedValueOnce(networkErr);

    const caughtErrors: unknown[] = [];

    function LogoutTrigger() {
      const { doLogout } = useAuth();
      return (
        <button
          onClick={() => {
            void doLogout().catch((e: unknown) => {
              caughtErrors.push(e);
            });
          }}
        >
          logout
        </button>
      );
    }

    render(<LogoutTrigger />, { wrapper: Wrapper });

    await act(async () => {
      screen.getByRole("button", { name: "logout" }).click();
    });
    await waitFor(() => expect(caughtErrors).toHaveLength(1));
    expect(caughtErrors[0]).toBe(networkErr);
  });
});
