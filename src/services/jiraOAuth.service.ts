import { AppError } from "../contract/errors.js";
import { decryptFromString, encryptToString } from "../crypto/encryption.js";
import { generateOAuthState } from "../crypto/tokens.js";
import type { JiraClient } from "../integrations/jira/jiraClient.js";
import type { JiraCredentialsRepository } from "../repositories/types.js";
import { systemClock, type Clock } from "./shared/clock.js";
import { withJiraErrorMapping } from "./shared/jiraErrorMapping.js";

const DEFAULT_STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes to complete the Atlassian consent screen

export interface JiraOAuthServiceConfig {
  jiraClient: JiraClient;
  jiraCredentials: JiraCredentialsRepository;
  encryptionKey: Buffer;
  stateTtlMs?: number;
  clock?: Clock;
}

export interface JiraConnectionStatus {
  connected: boolean;
  siteUrl?: string;
}

export interface JiraAccessToken {
  accessToken: string;
  cloudId: string;
  siteUrl: string;
}

export interface JiraOAuthService {
  connect(tenantId: string): string;
  handleCallback(input: { state: string; code?: string; error?: string }): Promise<void>;
  getValidAccessToken(tenantId: string): Promise<JiraAccessToken>;
  getStatus(tenantId: string): JiraConnectionStatus;
}

interface PendingState {
  tenantId: string;
  expiresAt: number;
}

/**
 * In-process TTL map for the OAuth `state` value -- per DECISIONS.md this is
 * the one cache-shaped piece of state in the app, and at single-instance POC
 * scale an in-process Map is sufficient (a second instance is the point at
 * which this would move to a shared store).
 */
export function createJiraOAuthService(config: JiraOAuthServiceConfig): JiraOAuthService {
  const clock = config.clock ?? systemClock;
  const stateTtlMs = config.stateTtlMs ?? DEFAULT_STATE_TTL_MS;
  const pendingStates = new Map<string, PendingState>();
  // Per-credential refresh lock: concurrent requests for the same tenant
  // share one in-flight refresh instead of racing to rotate the refresh
  // token (a second concurrent refresh using the now-stale token would fail).
  const refreshLocks = new Map<string, Promise<{ accessToken: string; expiresAt: string }>>();

  function consumeState(state: string): string {
    const pending = pendingStates.get(state);
    // Delete unconditionally: state is single-use regardless of outcome.
    pendingStates.delete(state);
    if (!pending || pending.expiresAt <= clock().getTime()) {
      throw new AppError("INVALID_OAUTH_STATE", "This Jira connection attempt expired or was already used. Start over.");
    }
    return pending.tenantId;
  }

  function refreshAndPersist(
    tenantId: string,
    refreshTokenEncrypted: string
  ): Promise<{ accessToken: string; expiresAt: string }> {
    const inFlight = refreshLocks.get(tenantId);
    if (inFlight) {
      return inFlight;
    }
    const refreshPromise = (async () => {
      const refreshToken = decryptFromString(refreshTokenEncrypted, config.encryptionKey);
      const tokenSet = await withJiraErrorMapping(() => config.jiraClient.refreshAccessToken(refreshToken));
      config.jiraCredentials.updateTokens(tenantId, {
        accessTokenEncrypted: encryptToString(tokenSet.accessToken, config.encryptionKey),
        refreshTokenEncrypted: encryptToString(tokenSet.refreshToken, config.encryptionKey),
        accessTokenExpiresAt: tokenSet.expiresAt,
        now: clock().toISOString()
      });
      return { accessToken: tokenSet.accessToken, expiresAt: tokenSet.expiresAt };
    })();
    refreshLocks.set(tenantId, refreshPromise);
    return refreshPromise.finally(() => refreshLocks.delete(tenantId));
  }

  return {
    connect(tenantId) {
      const state = generateOAuthState();
      pendingStates.set(state, { tenantId, expiresAt: clock().getTime() + stateTtlMs });
      return config.jiraClient.buildAuthorizeUrl(state);
    },

    async handleCallback(input) {
      const tenantId = consumeState(input.state);
      const code = input.code;
      if (input.error || !code) {
        throw new AppError("JIRA_UPSTREAM_ERROR", "Jira did not grant access. You can try connecting again.");
      }

      const tokenSet = await withJiraErrorMapping(() => config.jiraClient.exchangeCodeForTokens(code));
      const resources = await withJiraErrorMapping(() => config.jiraClient.getAccessibleResources(tokenSet.accessToken));
      const [site] = resources;
      if (!site) {
        throw new AppError("JIRA_UPSTREAM_ERROR", "Your Atlassian account has no accessible Jira sites.");
      }
      // Default to the first accessible site; documented assumption (CLAUDE.md / DECISIONS.md).

      config.jiraCredentials.upsert({
        tenantId,
        cloudId: site.cloudId,
        siteUrl: site.siteUrl,
        accessTokenEncrypted: encryptToString(tokenSet.accessToken, config.encryptionKey),
        refreshTokenEncrypted: encryptToString(tokenSet.refreshToken, config.encryptionKey),
        accessTokenExpiresAt: tokenSet.expiresAt,
        now: clock().toISOString()
      });
    },

    async getValidAccessToken(tenantId) {
      const credential = config.jiraCredentials.findByTenant(tenantId);
      if (!credential) {
        throw new AppError("JIRA_NOT_CONNECTED", "Connect your Jira workspace before doing this.");
      }

      const expiresAtMs = new Date(credential.accessTokenExpiresAt).getTime();
      const skewMs = 60_000;
      if (clock().getTime() < expiresAtMs - skewMs) {
        return {
          accessToken: decryptFromString(credential.accessTokenEncrypted, config.encryptionKey),
          cloudId: credential.cloudId,
          siteUrl: credential.siteUrl
        };
      }

      const refreshed = await refreshAndPersist(tenantId, credential.refreshTokenEncrypted);
      return { accessToken: refreshed.accessToken, cloudId: credential.cloudId, siteUrl: credential.siteUrl };
    },

    getStatus(tenantId) {
      const credential = config.jiraCredentials.findByTenant(tenantId);
      if (!credential) {
        return { connected: false };
      }
      return { connected: true, siteUrl: credential.siteUrl };
    }
  };
}
