import "server-only";

import type { ValdConnectionConfig, ValdTokenResponse } from "./types";
import { ValdAuthError } from "./errors";
import { mapValdTokenResponse } from "./mappers";
import { VALD_TOKEN_URL } from "./config";

// ── In-memory token cache ─────────────────────────────────────────────────────
//
// Keyed by clientId. Tokens are evicted 60 seconds before their stated expiry
// to give a buffer for clock skew and network latency.
//
// Note: This cache lives in Node.js module memory, so it is per-process and
// does not persist across cold starts or serverless invocations. That is fine
// for client_credentials tokens because they can be re-fetched cheaply at
// any time — the grant requires no user interaction.

type CachedToken = {
  accessToken: string;
  expiresAt: number; // Unix ms
};

const _tokenCache = new Map<string, CachedToken>();

const TOKEN_EXPIRY_BUFFER_MS = 60_000; // evict 1 minute early

function getCachedToken(clientId: string): string | null {
  const cached = _tokenCache.get(clientId);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now() + TOKEN_EXPIRY_BUFFER_MS) {
    _tokenCache.delete(clientId);
    return null;
  }
  return cached.accessToken;
}

function setCachedToken(clientId: string, token: ValdTokenResponse): void {
  const expiresAt = token.expiresAt ? Date.parse(token.expiresAt) : Date.now() + 3_600_000;
  if (!Number.isFinite(expiresAt)) return;
  _tokenCache.set(clientId, { accessToken: token.accessToken, expiresAt });
}

// ── Token endpoint request ────────────────────────────────────────────────────
//
// OAuth token endpoints use application/x-www-form-urlencoded, not JSON,
// so we call fetch directly rather than using valdRequestJson.

async function postTokenRequest(tokenUrl: string, params: Record<string, string>): Promise<unknown> {
  const body = new URLSearchParams(params).toString();
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  if (!response.ok) {
    throw new ValdAuthError(
      `VALD token request failed (${response.status}): ${typeof parsed === "string" ? parsed : JSON.stringify(parsed)}`,
    );
  }
  return parsed;
}

// ── Public: client_credentials grant ─────────────────────────────────────────

/**
 * Requests a new access token from the VALD security server using the
 * OAuth 2.0 client_credentials grant.
 *
 * Caches the token in memory and returns the cached version on subsequent
 * calls until the token is within TOKEN_EXPIRY_BUFFER_MS of expiry.
 *
 * VALD token endpoint (March 2026):
 *   POST https://security.valdperformance.com/connect/token
 *   Body (x-www-form-urlencoded):
 *     grant_type    = client_credentials
 *     client_id     = <your client id>
 *     client_secret = <your client secret>
 *     audience      = vald-api-external
 *
 * Note: no `scope` parameter is required.
 */
export async function requestValdClientCredentialsToken(config: {
  clientId: string;
  clientSecret: string;
  tokenUrl?: string | null;
}): Promise<ValdTokenResponse> {
  // Return cached token if still valid
  const cached = getCachedToken(config.clientId);
  if (cached) return { accessToken: cached, raw: null };

  const tokenUrl = config.tokenUrl ?? VALD_TOKEN_URL;
  const payload = await postTokenRequest(tokenUrl, {
    grant_type: "client_credentials",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    audience: "vald-api-external",
  });

  const token = mapValdTokenResponse(payload);
  if (!token.accessToken) {
    throw new ValdAuthError("VALD client_credentials grant returned no access token.");
  }

  setCachedToken(config.clientId, token);
  return token;
}

// ── Public: resolve access token from config ──────────────────────────────────

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
    // Prefer client_credentials flow when clientId + clientSecret are available.
    // This is the only supported grant type as of VALD March 2026 changes.
    if (config.clientId && config.clientSecret) {
      const token = await requestValdClientCredentialsToken({
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        tokenUrl: config.tokenUrl ?? config.endpointOverrides?.token,
      });
      return { authMode: "oauth", accessToken: token.accessToken, refreshedToken: token };
    }

    // Fall back to a stored access token if credentials are not yet available
    // (e.g. during the first connection test before credentials are saved).
    if (config.accessToken && !isTokenExpired(config.tokenExpiresAt)) {
      return { authMode: "oauth", accessToken: config.accessToken, refreshedToken: null };
    }
    if (config.accessToken) {
      // Token is expired and we have no credentials to refresh — surface it anyway
      // and let the caller decide whether to surface an auth error.
      return { authMode: "oauth", accessToken: config.accessToken, refreshedToken: null };
    }

    throw new ValdAuthError("VALD OAuth configuration is incomplete: clientId and clientSecret are required.");
  }

  return { authMode: "unknown", accessToken: null, apiKey: null, refreshedToken: null };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isTokenExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false;
  const ms = Date.parse(expiresAt);
  if (!Number.isFinite(ms)) return false;
  return ms <= Date.now() + TOKEN_EXPIRY_BUFFER_MS;
}
