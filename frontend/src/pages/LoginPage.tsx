import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../api/client";
import { Banner } from "../components/ui/Banner";
import { Button } from "../components/ui/Button";
import { Field } from "../components/ui/Field";

type Mode = "login" | "register";

export default function LoginPage() {
  const navigate = useNavigate();
  const { doLogin, doRegister } = useAuth();

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  function clearFieldErrors() {
    setEmailError(null);
    setError(null);
  }

  function handleModeSwitch(next: Mode) {
    setMode(next);
    clearFieldErrors();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    clearFieldErrors();
    setSubmitting(true);
    try {
      if (mode === "login") {
        await doLogin(email, password);
      } else {
        await doRegister(email, password);
      }
      void navigate("/");
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        switch (err.code) {
          case "INVALID_CREDENTIALS":
            setError("Incorrect email or password.");
            break;
          case "EMAIL_TAKEN":
            setEmailError("An account with this email already exists.");
            break;
          default:
            setError(err.message);
        }
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">IdentityHub</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">NHI finding tracker</p>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 space-y-5">
          {/* Tab switcher */}
          <div className="flex rounded-lg bg-gray-100 dark:bg-gray-800 p-1 gap-1">
            {(["login", "register"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => handleModeSwitch(m)}
                className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${
                  mode === m
                    ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                }`}
              >
                {m === "login" ? "Sign in" : "Register"}
              </button>
            ))}
          </div>

          {error && <Banner variant="error">{error}</Banner>}

          <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-4">
            <Field
              label="Email"
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting}
              error={emailError ?? undefined}
            />
            <Field
              label="Password"
              id="password"
              type="password"
              required
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              minLength={mode === "register" ? 8 : 1}
              maxLength={256}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
              hint={mode === "register" ? "At least 8 characters." : undefined}
            />
            <Button
              type="submit"
              loading={submitting}
              disabled={!email || !password}
              className="w-full justify-center"
            >
              {mode === "login" ? "Sign in" : "Create account"}
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-500 dark:text-gray-400">
          {mode === "login" ? (
            <>
              No account?{" "}
              <Link
                to="/login"
                onClick={() => handleModeSwitch("register")}
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                Register
              </Link>
            </>
          ) : (
            <>
              Already registered?{" "}
              <Link
                to="/login"
                onClick={() => handleModeSwitch("login")}
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                Sign in
              </Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
