import type { ApiKeySummary } from "../contract/index.js";
import { AppError } from "../contract/errors.js";
import { sha256Hex } from "../crypto/hashing.js";
import { generateId, generateOpaqueToken } from "../crypto/tokens.js";
import type { ApiKey, ApiKeysRepository } from "../repositories/types.js";
import { systemClock, type Clock } from "./shared/clock.js";

const API_KEY_PREFIX = "ih_";
const KEY_PREVIEW_CHARS = 8;
const DEFAULT_KEY_NAME = "Unnamed key";

export interface CreateApiKeyInput {
  name?: string;
  expiresAt?: string;
}

export interface CreateApiKeyResult {
  apiKey: ApiKeySummary;
  secret: string;
}

export interface ResolvedApiKey {
  tenantId: string;
  apiKeyId: string;
}

export interface ApiKeysServiceConfig {
  apiKeys: ApiKeysRepository;
  clock?: Clock;
}

export interface ApiKeysService {
  createApiKey(tenantId: string, input: CreateApiKeyInput): CreateApiKeyResult;
  listApiKeys(tenantId: string): ApiKeySummary[];
  revokeApiKey(tenantId: string, keyId: string): void;
  /** Resolution step: raw header value -> tenant. Throws UNAUTHENTICATED / API_KEY_REVOKED / API_KEY_EXPIRED. */
  resolveByRawKey(raw: string): ResolvedApiKey;
}

function toSummary(apiKey: ApiKey): ApiKeySummary {
  return {
    id: apiKey.id,
    name: apiKey.name,
    keyPrefix: apiKey.keyPrefix,
    createdAt: apiKey.createdAt,
    expiresAt: apiKey.expiresAt,
    revokedAt: apiKey.revokedAt,
    lastUsedAt: apiKey.lastUsedAt
  };
}

export function createApiKeysService(config: ApiKeysServiceConfig): ApiKeysService {
  const clock = config.clock ?? systemClock;

  return {
    createApiKey(tenantId, input) {
      const raw = `${API_KEY_PREFIX}${generateOpaqueToken(24)}`;
      const created = config.apiKeys.create({
        id: generateId(),
        tenantId,
        name: input.name ?? DEFAULT_KEY_NAME,
        keyHash: sha256Hex(raw),
        keyPrefix: raw.slice(0, API_KEY_PREFIX.length + KEY_PREVIEW_CHARS),
        createdAt: clock().toISOString(),
        expiresAt: input.expiresAt ?? null
      });
      return { apiKey: toSummary(created), secret: raw };
    },

    listApiKeys(tenantId) {
      return config.apiKeys.listByTenant(tenantId).map(toSummary);
    },

    revokeApiKey(tenantId, keyId) {
      const existing = config.apiKeys.findById(tenantId, keyId);
      if (!existing) {
        throw new AppError("NOT_FOUND", "API key not found.");
      }
      if (existing.revokedAt) {
        return; // idempotent: revoking an already-revoked key is not an error
      }
      config.apiKeys.revoke(tenantId, keyId, clock().toISOString());
    },

    resolveByRawKey(raw) {
      const found = config.apiKeys.findByHash(sha256Hex(raw));
      if (!found) {
        throw new AppError("UNAUTHENTICATED", "API key is invalid.");
      }
      if (found.revokedAt) {
        throw new AppError("API_KEY_REVOKED", "This API key has been revoked.");
      }
      if (found.expiresAt && new Date(found.expiresAt).getTime() < clock().getTime()) {
        throw new AppError("API_KEY_EXPIRED", "This API key has expired.");
      }
      config.apiKeys.touchLastUsed(found.tenantId, found.id, clock().toISOString());
      return { tenantId: found.tenantId, apiKeyId: found.id };
    }
  };
}
