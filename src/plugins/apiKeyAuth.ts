import type { FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "../contract/errors.js";
import { sha256Hex } from "../crypto/hashing.js";
import type { ApiKeysService } from "../services/apiKeys.service.js";
import "./requestContext.js";

/**
 * Header -> API key -> tenant resolution for the external REST API
 * (deliverable 7). Accepts either `Authorization: Bearer <key>` or
 * `X-API-Key: <key>`.
 *
 * `apiKeyRateLimitKeyGenerator` is exported separately from the auth
 * preHandler so @fastify/rate-limit can bucket by the same identity
 * (hash of the raw key) independently of whether auth has resolved yet --
 * @fastify/rate-limit's hook can run before our preHandler in the request
 * lifecycle, so it must be able to compute its own bucket key from the raw
 * header rather than from request.tenantId/apiKeyId.
 */
export function extractApiKeyFromHeaders(request: FastifyRequest): string | undefined {
  const authHeader = request.headers.authorization;
  if (authHeader) {
    const match = /^Bearer\s+(.+)$/i.exec(authHeader);
    const captured = match?.[1];
    if (captured) {
      return captured;
    }
  }
  const apiKeyHeader = request.headers["x-api-key"];
  if (typeof apiKeyHeader === "string" && apiKeyHeader.length > 0) {
    return apiKeyHeader;
  }
  return undefined;
}

export function apiKeyRateLimitKeyGenerator(request: FastifyRequest): string {
  const raw = extractApiKeyFromHeaders(request);
  return raw ? `apikey:${sha256Hex(raw)}` : `ip:${request.ip}`;
}

export function createApiKeyAuthHandler(apiKeysService: ApiKeysService) {
  return async function requireApiKey(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const raw = extractApiKeyFromHeaders(request);
    if (!raw) {
      throw new AppError("UNAUTHENTICATED", "Provide an API key via the Authorization or X-API-Key header.");
    }
    const resolved = apiKeysService.resolveByRawKey(raw);
    request.tenantId = resolved.tenantId;
    request.apiKeyId = resolved.apiKeyId;
  };
}
