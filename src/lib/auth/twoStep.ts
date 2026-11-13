/**
 * Server-side two-step sign-in rule, shared by the request proxy and the cookie session reader.
 *
 * An account must enter a code when its token carries `app_metadata.mfa_required = true` (set on admin accounts,
 * see docs/security/admin-mfa.md). A token from such an account whose session has not entered a code
 * (`aal` is not "aal2") is refused. Every other token passes, so ordinary coaches and players are untouched.
 *
 * These helpers only DECODE the token. That is safe here because they can only refuse: a forged token without the
 * flag still has to pass the route's own signature check (`verifiedUserIdFromToken` or `auth.getUser`), and a real token cannot drop the flag
 * without breaking its signature. Runs in the proxy, so no Node-only APIs.
 */

export type JwtClaims = {
  aal?: unknown;
  app_metadata?: { mfa_required?: unknown } | null;
  [key: string]: unknown;
};

function base64UrlToString(input: string): string {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64.padEnd(Math.ceil(b64.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** The payload of a JWT, or null when the token is not a readable JWT. Does not check the signature. */
export function decodeJwtClaims(token: string | null | undefined): JwtClaims | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const parsed: unknown = JSON.parse(base64UrlToString(parts[1]));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as JwtClaims) : null;
  } catch {
    return null;
  }
}

/** True when the account must use two-step sign-in and this session has not entered a code yet. */
export function claimsNeedCode(claims: JwtClaims | null): boolean {
  if (!claims) return false;
  return claims.app_metadata?.mfa_required === true && claims.aal !== "aal2";
}

export function tokenNeedsCode(token: string | null | undefined): boolean {
  return claimsNeedCode(decodeJwtClaims(token));
}

const AUTH_COOKIE = /^(sb-[^.]+-auth-token)(?:\.(\d+))?$/;
const BASE64_PREFIX = "base64-";

/**
 * Access tokens held in Supabase auth cookies, read the way @supabase/ssr writes them: one cookie or chunks
 * `<name>.0`, `<name>.1`, …, optionally `base64-` + base64url JSON. Unreadable cookies are skipped.
 */
export function accessTokensFromCookies(cookies: ReadonlyArray<{ name: string; value: string }>): string[] {
  const whole = new Map<string, string>();
  const chunks = new Map<string, Map<number, string>>();
  for (const c of cookies) {
    const m = AUTH_COOKIE.exec(c.name);
    if (!m) continue;
    if (m[2] == null) whole.set(m[1], c.value);
    else {
      if (!chunks.has(m[1])) chunks.set(m[1], new Map());
      chunks.get(m[1])!.set(Number(m[2]), c.value);
    }
  }
  const values: string[] = [];
  for (const key of new Set([...whole.keys(), ...chunks.keys()])) {
    const single = whole.get(key);
    if (single) { values.push(single); continue; }
    const parts = chunks.get(key);
    if (!parts) continue;
    const joined: string[] = [];
    for (let i = 0; parts.has(i); i++) joined.push(parts.get(i)!);
    if (joined.length) values.push(joined.join(""));
  }
  const tokens: string[] = [];
  for (const raw of values) {
    try {
      const json = raw.startsWith(BASE64_PREFIX) ? base64UrlToString(raw.slice(BASE64_PREFIX.length)) : raw;
      const parsed: unknown = JSON.parse(json);
      const token = Array.isArray(parsed)
        ? parsed[0]
        : parsed && typeof parsed === "object" ? (parsed as { access_token?: unknown }).access_token : null;
      if (typeof token === "string" && token) tokens.push(token);
    } catch {
      // Not a session we can read; the route's own check still applies.
    }
  }
  return tokens;
}

export const TWO_STEP_REQUIRED_MESSAGE =
  "Two-step sign-in required. Sign in again and enter the code from your authenticator app.";
