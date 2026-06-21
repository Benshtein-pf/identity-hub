import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { authResponseSchema, loginRequestSchema, registerRequestSchema, type UserResponse } from "../contract/index.js";
import { AppError } from "../contract/errors.js";
import { requireTenantId } from "../plugins/requestContext.js";
import type { AuthService, AuthSession } from "../services/index.js";

export interface AuthRoutesOptions {
  authService: AuthService;
  cookieName: string;
  requireSession: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
}

function toUserResponse(user: AuthSession["user"]): UserResponse {
  return { id: user.id, email: user.email, createdAt: user.createdAt };
}

function setSessionCookie(reply: FastifyReply, cookieName: string, sessionId: string, expiresAt: string): void {
  reply.setCookie(cookieName, sessionId, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    expires: new Date(expiresAt)
  });
}

export function registerAuthRoutes(fastify: FastifyInstance, options: AuthRoutesOptions): void {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.route({
    method: "POST",
    url: "/api/auth/register",
    schema: {
      body: registerRequestSchema,
      response: { 201: authResponseSchema }
    },
    config: {
      rateLimit: {
        max: 10,
        timeWindow: 60_000
      }
    },
    handler: async (request, reply) => {
      const { user, session } = await options.authService.register(request.body.email, request.body.password);
      setSessionCookie(reply, options.cookieName, session.id, session.expiresAt);
      reply.code(201).send({ user: toUserResponse(user) });
    }
  });

  app.route({
    method: "POST",
    url: "/api/auth/login",
    schema: {
      body: loginRequestSchema,
      response: { 200: authResponseSchema }
    },
    config: {
      rateLimit: {
        max: 10,
        timeWindow: 60_000
      }
    },
    handler: async (request, reply) => {
      const { user, session } = await options.authService.login(request.body.email, request.body.password);
      setSessionCookie(reply, options.cookieName, session.id, session.expiresAt);
      reply.code(200).send({ user: toUserResponse(user) });
    }
  });

  app.route({
    method: "POST",
    url: "/api/auth/logout",
    preHandler: options.requireSession,
    handler: async (request, reply) => {
      const tenantId = requireTenantId(request);
      const sessionId = request.cookies[options.cookieName];
      if (sessionId) {
        options.authService.logout(tenantId, sessionId);
      }
      reply.clearCookie(options.cookieName, { path: "/", httpOnly: true, secure: true, sameSite: "lax" });
      reply.code(204).send();
    }
  });

  app.route({
    method: "GET",
    url: "/api/auth/me",
    schema: {
      response: { 200: authResponseSchema }
    },
    preHandler: options.requireSession,
    handler: async (request, reply) => {
      const tenantId = requireTenantId(request);
      const userId = request.userId;
      const user = userId ? options.authService.getUser(tenantId, userId) : null;
      if (!user) {
        throw new AppError("UNAUTHENTICATED", "Sign in to continue.");
      }
      reply.code(200).send({ user: toUserResponse(user) });
    }
  });
}
