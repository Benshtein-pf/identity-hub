import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode
} from "react";
import type { z } from "zod";
import type { userResponseSchema } from "@contract/auth.contract";
import { getMe, login, logout, register } from "../api/endpoints";
import { ApiError } from "../api/client";

export type User = z.infer<typeof userResponseSchema>;

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  /** Called by components when they receive UNAUTHENTICATED — clears state without an API call. */
  clearSession: () => void;
  doLogin: (email: string, password: string) => Promise<void>;
  doRegister: (email: string, password: string) => Promise<void>;
  doLogout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMe()
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const clearSession = useCallback(() => setUser(null), []);

  const doLogin = useCallback(async (email: string, password: string) => {
    const r = await login(email, password);
    setUser(r.user);
  }, []);

  const doRegister = useCallback(async (email: string, password: string) => {
    const r = await register(email, password);
    setUser(r.user);
  }, []);

  const doLogout = useCallback(async () => {
    try {
      await logout();
    } catch (err) {
      // If the session is already gone on the server, swallow the error —
      // we still need to clear local state.
      if (!(err instanceof ApiError)) throw err;
    }
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, clearSession, doLogin, doRegister, doLogout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (ctx === null) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
