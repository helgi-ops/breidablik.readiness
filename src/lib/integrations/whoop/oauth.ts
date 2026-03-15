import crypto from "crypto";
import { getRequiredWhoopEnv, WHOOP_AUTH_URL, WHOOP_SCOPES, WHOOP_TOKEN_URL } from "./config";
import type { WhoopTokenResponse } from "./types";

function buildFormBody(payload: Record<string, string>): URLSearchParams {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(payload)) body.set(key, value);
  return body;
}

/**
 * Deterministic server helper for secure OAuth state generation.
 */
export function createWhoopOauthState(): string {
  return crypto.randomBytes(24).toString("hex");
}

export function buildWhoopAuthorizeUrl(params: { state: string }): string {
  const env = getRequiredWhoopEnv();
  const url = new URL(WHOOP_AUTH_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", env.clientId);
  url.searchParams.set("redirect_uri", env.redirectUri);
  url.searchParams.set("scope", WHOOP_SCOPES.join(" "));
  url.searchParams.set("state", params.state);
  return url.toString();
}

async function postToken(form: URLSearchParams): Promise<WhoopTokenResponse> {
  const response = await fetch(WHOOP_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as WhoopTokenResponse | { error?: string; error_description?: string } | null;
  if (!response.ok || !payload || !("access_token" in payload)) {
    const reason =
      payload && "error_description" in payload && payload.error_description
        ? payload.error_description
        : payload && "error" in payload && payload.error
          ? payload.error
          : `WHOOP token request failed (${response.status})`;
    throw new Error(reason);
  }
  return payload;
}

export async function exchangeWhoopCodeForToken(code: string): Promise<WhoopTokenResponse> {
  const env = getRequiredWhoopEnv();
  const form = buildFormBody({
    grant_type: "authorization_code",
    code,
    redirect_uri: env.redirectUri,
    client_id: env.clientId,
    client_secret: env.clientSecret,
    scope: WHOOP_SCOPES.join(" "),
  });
  return postToken(form);
}

export async function refreshWhoopAccessToken(refreshToken: string): Promise<WhoopTokenResponse> {
  const env = getRequiredWhoopEnv();
  const form = buildFormBody({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: env.clientId,
    client_secret: env.clientSecret,
    scope: WHOOP_SCOPES.join(" "),
  });
  return postToken(form);
}

export function computeAccessTokenExpiresAt(token: WhoopTokenResponse): string | null {
  if (!token.expires_in || !Number.isFinite(token.expires_in)) return null;
  return new Date(Date.now() + token.expires_in * 1000).toISOString();
}

export function redactWhoopSensitive(input: string): string {
  return input
    .replace(/access_token=([^&\s]+)/g, "access_token=[redacted]")
    .replace(/refresh_token=([^&\s]+)/g, "refresh_token=[redacted]")
    .replace(/[A-Za-z0-9-_]{24,}\.[A-Za-z0-9-_]{16,}\.[A-Za-z0-9-_]{16,}/g, "[redacted-token]");
}

// Backward-compatible alias used in existing routes.
export const generateWhoopOAuthState = createWhoopOauthState;
