// Polar Team Pro OAuth + API configuration.
// Both Team Pro and AccessLink share the same OAuth2 admin portal:
//   https://admin.polaraccesslink.com
// Register a new client there to get POLAR_CLIENT_ID + POLAR_CLIENT_SECRET.
// Set redirect URI to <APP_URL>/api/integrations/polar/callback

export const POLAR_AUTH_URL = "https://flow.polar.com/oauth2/authorization";
export const POLAR_TOKEN_URL = "https://polarremote.com/v2/oauth2/token";
export const POLAR_API_BASE = process.env.POLAR_API_BASE || "https://www.polaraccesslink.com";

// Team Pro API base. Some Polar partners use a separate Team Pro endpoint —
// override via env var if your contract specifies a different URL.
export const POLAR_TEAMPRO_API_BASE =
  process.env.POLAR_TEAMPRO_API_BASE || "https://teampro.api.polar.com";

// Polar uses minimal scopes for AccessLink. Team Pro scopes are managed
// at the partner-agreement level and don't need to be requested in the URL.
export const POLAR_SCOPES = ["team_read"] as const;

export type PolarEnv = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

function normalizeBaseUrl(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed.replace(/\/+$/, "");
  }
  return `https://${trimmed.replace(/\/+$/, "")}`;
}

function resolvePolarRedirectUri(): string | null {
  const explicit = process.env.POLAR_REDIRECT_URI?.trim();
  if (explicit) return explicit;

  const baseUrl =
    normalizeBaseUrl(process.env.NEXT_PUBLIC_APP_URL) ??
    normalizeBaseUrl(process.env.VERCEL_PROJECT_PRODUCTION_URL) ??
    normalizeBaseUrl(process.env.VERCEL_URL);

  if (!baseUrl) return null;
  return `${baseUrl}/api/integrations/polar/callback`;
}

/** Server-only env validation. Never expose POLAR_CLIENT_SECRET to the client. */
export function getPolarEnv(): PolarEnv {
  const clientId = process.env.POLAR_CLIENT_ID?.trim() || "";
  const clientSecret = process.env.POLAR_CLIENT_SECRET?.trim() || "";
  const redirectUri = resolvePolarRedirectUri() || "";
  return { clientId, clientSecret, redirectUri };
}

export function getRequiredPolarEnv(): PolarEnv {
  const env = getPolarEnv();
  const missing: string[] = [];
  if (!env.clientId) missing.push("POLAR_CLIENT_ID");
  if (!env.clientSecret) missing.push("POLAR_CLIENT_SECRET");
  if (!env.redirectUri) missing.push("POLAR_REDIRECT_URI (or NEXT_PUBLIC_APP_URL)");
  if (missing.length) {
    throw new Error(`POLAR env vars missing: ${missing.join(", ")}`);
  }
  return env;
}
