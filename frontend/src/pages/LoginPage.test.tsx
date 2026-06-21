/**
 * Tests for LoginPage — auth form, mode toggle, and error-code mapping.
 * useNavigate is spied via a partial mock so Link and MemoryRouter still work.
 * useAuth is fully mocked so no real API calls are made.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import LoginPage from "./LoginPage";
import { ApiError } from "../api/client";

// ── mocks ─────────────────────────────────────────────────────────────────────

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("../auth/AuthContext", () => ({
  useAuth: vi.fn()
}));

import * as AuthModule from "../auth/AuthContext";

const mockDoLogin = vi.fn();
const mockDoRegister = vi.fn();

beforeEach(() => {
  mockNavigate.mockReset();
  mockDoLogin.mockReset();
  mockDoRegister.mockReset();
  vi.mocked(AuthModule.useAuth).mockReturnValue({
    user: null,
    loading: false,
    clearSession: vi.fn(),
    doLogin: mockDoLogin,
    doRegister: mockDoRegister,
    doLogout: vi.fn()
  });
});

function renderLoginPage() {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>
  );
  return user;
}

/**
 * The login page has two buttons with the same text "Sign in": the tab button
 * and the submit button. This helper finds the submit button specifically by
 * the HTML type attribute so assertions on disabled/enabled state are accurate.
 */
function getSubmitBtn(name: string): HTMLElement {
  const matches = screen.getAllByRole("button", { name });
  const submitBtn = matches.find((b) => b.getAttribute("type") === "submit");
  if (!submitBtn) throw new Error(`No submit button with name "${name}" found`);
  return submitBtn;
}

// ── mode toggle ───────────────────────────────────────────────────────────────

describe("LoginPage — mode toggle", () => {
  it("starts in login mode with no Create account button visible", () => {
    renderLoginPage();
    expect(screen.queryByRole("button", { name: "Create account" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Register" })).toBeInTheDocument();
  });

  it("switches to register mode when the Register tab is clicked", async () => {
    const user = renderLoginPage();
    await user.click(screen.getByRole("button", { name: "Register" }));
    expect(screen.getByRole("button", { name: "Create account" })).toBeInTheDocument();
  });

  it("clears a previous error banner when switching modes", async () => {
    mockDoLogin.mockRejectedValueOnce(
      new ApiError("INVALID_CREDENTIALS", "Incorrect email or password.", 401)
    );
    const user = renderLoginPage();

    await user.type(screen.getByLabelText(/email/i), "a@b.com");
    await user.type(screen.getByLabelText(/password/i), "wrongpw");
    await user.click(getSubmitBtn("Sign in"));
    await screen.findByText("Incorrect email or password.");

    // Switch mode — error should clear
    await user.click(screen.getByRole("button", { name: "Register" }));
    expect(screen.queryByText("Incorrect email or password.")).not.toBeInTheDocument();
  });
});

// ── submit button disabled state ──────────────────────────────────────────────

describe("LoginPage — submit button disabled state", () => {
  it("submit is disabled when both fields are empty", () => {
    renderLoginPage();
    expect(getSubmitBtn("Sign in")).toBeDisabled();
  });

  it("submit is disabled when only email is filled", async () => {
    const user = renderLoginPage();
    await user.type(screen.getByLabelText(/email/i), "a@b.com");
    expect(getSubmitBtn("Sign in")).toBeDisabled();
  });

  it("submit is enabled once both email and password are filled", async () => {
    const user = renderLoginPage();
    await user.type(screen.getByLabelText(/email/i), "a@b.com");
    await user.type(screen.getByLabelText(/password/i), "pw");
    expect(getSubmitBtn("Sign in")).toBeEnabled();
  });
});

// ── error-code mapping ────────────────────────────────────────────────────────

describe("LoginPage — error mapping on submit", () => {
  it("shows 'Incorrect email or password.' for INVALID_CREDENTIALS", async () => {
    mockDoLogin.mockRejectedValueOnce(
      new ApiError("INVALID_CREDENTIALS", "Incorrect email or password.", 401)
    );
    const user = renderLoginPage();
    await user.type(screen.getByLabelText(/email/i), "a@b.com");
    await user.type(screen.getByLabelText(/password/i), "wrong");
    await user.click(getSubmitBtn("Sign in"));

    await screen.findByText("Incorrect email or password.");
  });

  it("shows inline email error for EMAIL_TAKEN in register mode", async () => {
    mockDoRegister.mockRejectedValueOnce(
      new ApiError("EMAIL_TAKEN", "An account with this email already exists.", 409)
    );
    const user = renderLoginPage();

    await user.click(screen.getByRole("button", { name: "Register" }));
    await user.type(screen.getByLabelText(/email/i), "taken@example.com");
    await user.type(screen.getByLabelText(/password/i), "password123");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    await screen.findByText("An account with this email already exists.");
  });

  it("shows the raw error message for an unrecognised error code", async () => {
    mockDoLogin.mockRejectedValueOnce(
      new ApiError("INTERNAL_ERROR", "Something exploded on the server.", 500)
    );
    const user = renderLoginPage();
    await user.type(screen.getByLabelText(/email/i), "a@b.com");
    await user.type(screen.getByLabelText(/password/i), "pw");
    await user.click(getSubmitBtn("Sign in"));

    await screen.findByText("Something exploded on the server.");
  });

  it("shows a generic message for non-ApiError rejections", async () => {
    mockDoLogin.mockRejectedValueOnce(new TypeError("network failure"));
    const user = renderLoginPage();
    await user.type(screen.getByLabelText(/email/i), "a@b.com");
    await user.type(screen.getByLabelText(/password/i), "pw");
    await user.click(getSubmitBtn("Sign in"));

    await screen.findByText("Something went wrong. Please try again.");
  });
});

// ── successful submit ─────────────────────────────────────────────────────────

describe("LoginPage — successful submit", () => {
  it("navigates to / after successful login", async () => {
    mockDoLogin.mockResolvedValueOnce(undefined);
    const user = renderLoginPage();
    await user.type(screen.getByLabelText(/email/i), "a@b.com");
    await user.type(screen.getByLabelText(/password/i), "correct");
    await user.click(getSubmitBtn("Sign in"));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/"));
  });

  it("navigates to / after successful register", async () => {
    mockDoRegister.mockResolvedValueOnce(undefined);
    const user = renderLoginPage();
    await user.click(screen.getByRole("button", { name: "Register" }));
    await user.type(screen.getByLabelText(/email/i), "new@b.com");
    await user.type(screen.getByLabelText(/password/i), "password123");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/"));
  });
});
