import crypto from "crypto";
import { getRequiredPolarEnv, POLAR_AUTH_URL, POLAR_TOKEN_URL, POLAR_SCOPES } from "./config";
import type { PolarTokenResponse } from "./types";

function buildFormBody(payload: Record<string, string>): URLSearchParams {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(payload)) body.set(key, value);
  return body;
}

/** Cryptographically random OAuth state. Stored in httpOnly cookie + verified on callback. */
export function createPolarOauthState(): string {
  return crypto.randomBytes(24).toString("hex");
}

export function buildPolarAuthorizeUrl(params: { state: string }): string {
  const env = getRequiredPolarEnv();
  const url = new URL(POLAR_AUTH_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", env.clientId);
  url.searchParams.set("redirect_uri", env.redirectUri);
  url.searchParams.set("scope", POLAR_SCOPES.join(" "));
  url.searchParams.set("state", params.state);
  return url.toString();
}

/**
 * Polar uses HTTP Basic auth with client_id:client_secret on the token endpoint.
 * The body carries grant_type, code, redirect_uri.
 */
async function postToken(form: URLSearchParams): Promise<PolarTokenResponse> {
  const env = getRequiredPolarEnv();
  const basic = Buffer.from(`${env.clientId}:${env.clientSecret}`).toString("base64");

  const response = await fetch(POLAR_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json;charset=UTF-8",
      "Authorization": `Basic ${basic}`,
    },
    body: form.toString(),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as
    | PolarTokenResponse
    | { error?: string; error_description?: string }
    | null;

  if (!response.ok || !payload || !("access_token" in payload)) {
    const reason =
      payload && "error_description" in payload && payload.error_description
        ? payload.error_description
        : payload && "error" in payload && payload.error
          ? payload.error
          : `POLAR token request failed (${response.status})`;
    throw new Error(reason);
  }
  return payload;
}

export async function exchangePolarCodeForToken(code: string): Promise<PolarTokenResponse> {
  const env = getRequiredPolarEnv();
  const form = buildFormBody({
    grant_type: "authorization_code",
    code,
    redirect_uri: env.redirectUri,
  });
  return postToken(form);
}

export async function refreshPolarAccessToken(refreshToken: string): Promise<PolarTokenResponse> {
  const form = buildFormBody({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  return postToken(form);
}

export function computePolarTokenExpiresAt(token: PolarTokenResponse): string | null {
  if (!token.expires_in || !Number.isFinite(token.expires_in)) return null;
  return new Date(Date.now() + token.expires_in * 1000).toISOString();
}
