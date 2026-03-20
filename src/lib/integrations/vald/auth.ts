import "server-only";

import type { ValdConnectionConfig, ValdTokenResponse } from "./types";
import { ValdAuthError } from "./errors";
import { valdRequestJson } from "./client";
import { mapValdTokenResponse } from "./mappers";

export async function resolveValdAccessToken(config: ValdConnectionConfig): Promise<{
  authMode: "api_key" | "oauth" | "unknown";
  accessToken?: string | null;
  apiKey?: string | null;
  refreshedToken?: ValdTokenResponse | null;
}> {
  if (config.authMode === "api_key" && config.apiKey) {
    return { authMode: "api_key", apiKey: config.apiKey, refreshedToken: null };
  }

  if (config.authMode === "oauth") {
    if (config.accessToken && !isExpired(config.tokenExpiresAt)) {
      return { authMode: "oauth", accessToken: config.accessToken, refreshedToken: null };
    }
    if (config.refreshToken) {
      const refreshed = await refreshValdToken(config);
      return { authMode: "oauth", accessToken: refreshed.accessToken, refreshedToken: refreshed };
    }
    if (config.accessToken) {
      return { authMode: "oauth", accessToken: config.accessToken, refreshedToken: null };
    }
    throw new ValdAuthError("VALD OAuth credentials are incomplete.");
  }

  return { authMode: "unknown", accessToken: null, apiKey: null, refreshedToken: null };
}

export async function refreshValdToken(config: ValdConnectionConfig): Promise<ValdTokenResponse> {
  if (!config.clientId || !config.clientSecret || !config.refreshToken) {
    throw new ValdAuthError("VALD token refresh requires client id, client secret, and refresh token.");
  }
  const tokenEndpoint = new URL(config.endpointOverrides?.token ?? "/oauth/token", config.baseUrl).toString();
  const payload = await valdRequestJson(tokenEndpoint, {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
    },
    body: {
      grant_type: "refresh_token",
      refresh_token: config.refreshToken,
    },
    timeoutMs: config.timeoutMs,
  });
  const token = mapValdTokenResponse(payload);
  if (!token.accessToken) throw new ValdAuthError("VALD token refresh returned no access token.");
  return token;
}

function isExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false;
  const ms = Date.parse(expiresAt);
  if (!Number.isFinite(ms)) return false;
  return ms <= Date.now() + 60_000;
}
