export const WHOOP_API_BASE = process.env.WHOOP_API_BASE || "https://api.prod.whoop.com";
export const WHOOP_AUTH_URL = "https://api.prod.whoop.com/oauth/oauth2/auth";
export const WHOOP_TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token";
export const WHOOP_SCOPES = ["read:profile", "read:recovery", "read:sleep", "read:workout", "offline"] as const;

export type WhoopEnv = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

/**
 * Server-only WHOOP env validation. Keep client secret access strictly server-side.
 */
export function getWhoopEnv(): WhoopEnv {
  const clientId = process.env.WHOOP_CLIENT_ID;
  const clientSecret = process.env.WHOOP_CLIENT_SECRET;
  const redirectUri = process.env.WHOOP_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("WHOOP env vars missing. Required: WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET, WHOOP_REDIRECT_URI");
  }

  return { clientId, clientSecret, redirectUri };
}

/**
 * Canonical WHOOP env accessor used by server-only integration paths.
 */
export function getRequiredWhoopEnv(): WhoopEnv {
  return getWhoopEnv();
}
