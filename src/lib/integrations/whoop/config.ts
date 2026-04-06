export const WHOOP_API_BASE = process.env.WHOOP_API_BASE || "https://api.prod.whoop.com";
export const WHOOP_AUTH_URL = "https://api.prod.whoop.com/oauth/oauth2/auth";
export const WHOOP_TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token";
export const WHOOP_SCOPES = ["read:profile", "read:recovery", "read:sleep", "read:workout", "offline"] as const;

export type WhoopEnv = {
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

function resolveWhoopRedirectUri(): string | null {
  const explicit = process.env.WHOOP_REDIRECT_URI?.trim();
  if (explicit) return explicit;

  const baseUrl =
    normalizeBaseUrl(process.env.NEXT_PUBLIC_APP_URL) ??
    normalizeBaseUrl(process.env.VERCEL_PROJECT_PRODUCTION_URL) ??
    normalizeBaseUrl(process.env.VERCEL_URL);

  if (!baseUrl) return null;
  return `${baseUrl}/api/integrations/whoop/callback`;
}

/**
 * Server-only WHOOP env validation. Keep client secret access strictly server-side.
 */
export function getWhoopEnv(): WhoopEnv {
  const clientId = process.env.WHOOP_CLIENT_ID?.trim() || "";
  const clientSecret = process.env.WHOOP_CLIENT_SECRET?.trim() || "";
  const redirectUri = resolveWhoopRedirectUri() || "";

  const missing: string[] = [];
  if (!clientId) missing.push("WHOOP_CLIENT_ID");
  if (!clientSecret) missing.push("WHOOP_CLIENT_SECRET");
  if (!redirectUri) missing.push("WHOOP_REDIRECT_URI (or NEXT_PUBLIC_APP_URL / VERCEL_PROJECT_PRODUCTION_URL / VERCEL_URL)");

  if (missing.length > 0) {
    throw new Error(`WHOOP env vars missing. Required: ${missing.join(", ")}`);
  }

  return { clientId, clientSecret, redirectUri };
}

/**
 * Canonical WHOOP env accessor used by server-only integration paths.
 */
export function getRequiredWhoopEnv(): WhoopEnv {
  return getWhoopEnv();
}
