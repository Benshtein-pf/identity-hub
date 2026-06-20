import { AppError } from "../contract/errors.js";
import { generateId, generateOpaqueToken } from "../crypto/tokens.js";
import { hashPassword, verifyPassword } from "../crypto/hashing.js";
import type { Session, SessionsRepository, TenantsRepository, User, UsersRepository } from "../repositories/types.js";
import { systemClock, type Clock } from "./shared/clock.js";

export interface AuthServiceConfig {
  users: UsersRepository;
  sessions: SessionsRepository;
  tenants: TenantsRepository;
  sessionTtlDays: number;
  clock?: Clock;
}

export interface AuthSession {
  user: User;
  session: Session;
}

export interface AuthService {
  register(email: string, password: string): Promise<AuthSession>;
  login(email: string, password: string): Promise<AuthSession>;
  /** Resolution step: cookie -> session -> tenant. Returns null if absent/expired (never throws for that). */
  validateSession(sessionId: string): AuthSession | null;
  logout(tenantId: string, sessionId: string): void;
  /** Looks up the full user record for a tenant/userId pair already resolved by validateSession. */
  getUser(tenantId: string, userId: string): User | null;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export function createAuthService(config: AuthServiceConfig): AuthService {
  const clock = config.clock ?? systemClock;

  function newSessionWindow(): { createdAt: string; expiresAt: string } {
    const now = clock();
    return { createdAt: now.toISOString(), expiresAt: addDays(now, config.sessionTtlDays).toISOString() };
  }

  return {
    async register(email, password) {
      const existing = config.users.findByEmail(email);
      if (existing) {
        throw new AppError("EMAIL_TAKEN", "An account with this email already exists.");
      }

      const passwordHash = await hashPassword(password);
      const now = clock().toISOString();
      const tenant = config.tenants.create({ id: generateId(), createdAt: now });

      let user: User;
      try {
        user = config.users.create({ id: generateId(), tenantId: tenant.id, email, passwordHash, createdAt: now });
      } catch (error) {
        // Defense in depth against a registration race on the same email
        // (the users.email UNIQUE constraint is the source of truth here).
        // Only this specific constraint violation is reported as EMAIL_TAKEN;
        // any other error (e.g. a genuine DB failure) propagates unchanged
        // rather than being misreported to the client.
        if (error instanceof Error && "code" in error && error.code === "SQLITE_CONSTRAINT_UNIQUE") {
          throw new AppError("EMAIL_TAKEN", "An account with this email already exists.");
        }
        throw error;
      }

      const window = newSessionWindow();
      const session = config.sessions.create({
        id: generateOpaqueToken(),
        tenantId: tenant.id,
        userId: user.id,
        createdAt: window.createdAt,
        lastActiveAt: window.createdAt,
        expiresAt: window.expiresAt
      });

      return { user, session };
    },

    async login(email, password) {
      const user = config.users.findByEmail(email);
      if (!user) {
        // Same message whether the email is unknown or the password is wrong: do not leak which.
        throw new AppError("INVALID_CREDENTIALS", "Email or password is incorrect.");
      }
      const passwordMatches = await verifyPassword(user.passwordHash, password);
      if (!passwordMatches) {
        throw new AppError("INVALID_CREDENTIALS", "Email or password is incorrect.");
      }

      const window = newSessionWindow();
      const session = config.sessions.create({
        id: generateOpaqueToken(),
        tenantId: user.tenantId,
        userId: user.id,
        createdAt: window.createdAt,
        lastActiveAt: window.createdAt,
        expiresAt: window.expiresAt
      });

      return { user, session };
    },

    validateSession(sessionId) {
      const session = config.sessions.findById(sessionId);
      if (!session) {
        return null;
      }
      const now = clock();
      if (new Date(session.expiresAt).getTime() <= now.getTime()) {
        config.sessions.delete(session.tenantId, session.id);
        return null;
      }

      const user = config.users.findById(session.tenantId, session.userId);
      if (!user) {
        // Data integrity edge case (user removed but session lingered): fail closed.
        config.sessions.delete(session.tenantId, session.id);
        return null;
      }

      // Sliding expiry: every authenticated request pushes expiry forward.
      const newExpiresAt = addDays(now, config.sessionTtlDays).toISOString();
      config.sessions.touch(session.tenantId, session.id, now.toISOString(), newExpiresAt);

      return { user, session: { ...session, lastActiveAt: now.toISOString(), expiresAt: newExpiresAt } };
    },

    logout(tenantId, sessionId) {
      config.sessions.delete(tenantId, sessionId);
    },

    getUser(tenantId, userId) {
      return config.users.findById(tenantId, userId);
    }
  };
}
