import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from "fastify-type-provider-zod";
import { env } from "./config/env.js";
import { AppError } from "./contract/errors.js";
import { validateEncryptionKey } from "./crypto/encryption.js";
import { createDatabase } from "./db/connection.js";
import type Database from "better-sqlite3";
import { createJiraClient, type JiraClient } from "./integrations/jira/jiraClient.js";
import { registerErrorHandler } from "./plugins/errorHandler.js";
import { createSessionAuthHandler } from "./plugins/sessionAuth.js";
import { registerSwagger } from "./plugins/swagger.js";
import { createRepositories } from "./repositories/index.js";
import { registerApiKeysRoutes } from "./routes/apiKeys.routes.js";
import { registerAuthRoutes } from "./routes/auth.routes.js";
import { registerJiraRoutes } from "./routes/jira.routes.js";
import { registerTicketsRoutes } from "./routes/tickets.routes.js";
import { registerFindingsRoutes } from "./routes/v1/findings.routes.js";
import {
  createApiKeysService,
  createAuthService,
  createJiraOAuthService,
  createJiraService,
  createTicketsService,
  type ApiKeysService,
  type AuthService,
  type JiraOAuthService,
  type JiraService,
  type TicketsService
} from "./services/index.js";

export interface AppDependencies {
  db: Database.Database;
  authService: AuthService;
  jiraOAuthService: JiraOAuthService;
  jiraService: JiraService;
  ticketsService: TicketsService;
  apiKeysService: ApiKeysService;
  sessionCookieName: string;
  frontendUrl: string;
  rateLimitMax: number;
  rateLimitWindowMs: number;
}

export interface CreateDependenciesOptions {
  /** Override the SQLite file path; pass ":memory:" in tests. */
  databasePath?: string;
  /** Override the Jira client; tests inject a fake so no real network calls happen. */
  jiraClient?: JiraClient;
}

/** Wires repositories, the Jira client, and every service against one DB handle. The only thing here that reads `env` directly. */
export function createDependencies(options: CreateDependenciesOptions = {}): AppDependencies {
  const db = createDatabase(options.databasePath ?? env.DATABASE_PATH);
  const repositories = createRepositories(db);
  const encryptionKey = validateEncryptionKey(env.APP_ENCRYPTION_KEY);

  const jiraClient =
    options.jiraClient ??
    createJiraClient({
      clientId: env.ATLASSIAN_CLIENT_ID,
      clientSecret: env.ATLASSIAN_CLIENT_SECRET,
      redirectUri: env.ATLASSIAN_REDIRECT_URI
    });

  const authService = createAuthService({
    users: repositories.users,
    sessions: repositories.sessions,
    tenants: repositories.tenants,
    sessionTtlDays: env.SESSION_TTL_DAYS
  });

  const jiraOAuthService = createJiraOAuthService({
    jiraClient,
    jiraCredentials: repositories.jiraCredentials,
    encryptionKey
  });

  const jiraService = createJiraService({ jiraClient, jiraOAuth: jiraOAuthService });

  const ticketsService = createTicketsService({
    tickets: repositories.tickets,
    jiraClient,
    jiraService,
    jiraOAuth: jiraOAuthService
  });

  const apiKeysService = createApiKeysService({ apiKeys: repositories.apiKeys });

  return {
    db,
    authService,
    jiraOAuthService,
    jiraService,
    ticketsService,
    apiKeysService,
    sessionCookieName: env.SESSION_COOKIE_NAME,
    frontendUrl: env.FRONTEND_URL,
    rateLimitMax: env.API_KEY_RATE_LIMIT_MAX,
    rateLimitWindowMs: env.API_KEY_RATE_LIMIT_WINDOW_MS
  };
}

/** Builds the Fastify instance from already-constructed dependencies. Pure function of `deps`, so tests can substitute a fake Jira client via createDependencies and pass the result straight through. */
export async function buildApp(deps: AppDependencies): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger:
      env.NODE_ENV === "test"
        ? false
        : {
            redact: [
              "req.headers.authorization",
              "req.headers.cookie",
              'req.headers["x-api-key"]',
              'res.headers["set-cookie"]'
            ]
          }
  }).withTypeProvider<ZodTypeProvider>();

  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);

  // CORS must be registered before any route so preflight OPTIONS requests are
  // answered before the session auth hook can reject them. Scoped to the single
  // configured FRONTEND_URL (never "*", which is invalid with credentials:true).
  await fastify.register(cors, {
    origin: deps.frontendUrl,
    credentials: true,
    methods: ["GET", "POST", "DELETE", "OPTIONS"]
  });

  registerErrorHandler(fastify);
  await registerSwagger(fastify);
  await fastify.register(cookie);
  await fastify.register(rateLimit, {
    global: false,
    // @fastify/rate-limit does `throw errorResponseBuilder(...)` (not
    // reply.send(...)), so this must return an actual Error -- specifically
    // an AppError, so our setErrorHandler recognizes it and applies the
    // structured error contract instead of falling through to a generic 500.
    errorResponseBuilder: (_request, context) =>
      new AppError("RATE_LIMITED", `Too many requests. Try again in ${context.after}.`)
  });

  const requireSession = createSessionAuthHandler(deps.authService, deps.sessionCookieName);

  registerAuthRoutes(fastify, {
    authService: deps.authService,
    cookieName: deps.sessionCookieName,
    requireSession
  });
  registerJiraRoutes(fastify, {
    jiraOAuthService: deps.jiraOAuthService,
    jiraService: deps.jiraService,
    frontendUrl: deps.frontendUrl,
    requireSession
  });
  registerTicketsRoutes(fastify, { ticketsService: deps.ticketsService, requireSession });
  registerApiKeysRoutes(fastify, { apiKeysService: deps.apiKeysService, requireSession });
  registerFindingsRoutes(fastify, {
    ticketsService: deps.ticketsService,
    apiKeysService: deps.apiKeysService,
    rateLimitMax: deps.rateLimitMax,
    rateLimitWindowMs: deps.rateLimitWindowMs
  });

  return fastify;
}
