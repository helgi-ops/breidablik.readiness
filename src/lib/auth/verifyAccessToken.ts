import "server-only";

import type { JWK, SupabaseClient } from "@supabase/supabase-js";

/**
 * Verify a user's access token on the server WITHOUT a round-trip to Supabase Auth.
 *
 * Why: `auth.getUser(token)` calls /auth/v1/user, which queries the database. One player opening the app made
 * 19–51 of those calls (13 Nov 2026, 09:01), and at that moment the database was timing out (statement timeouts
 * 09:01–09:03). User tokens are signed with an asymmetric key (ES256), so the signature and expiry can be checked
 * here against the project's public keys. That is the same check PostgREST makes before every row-level-security
 * read, so it does not trust a token any more than the database already does.
 *
 * What it does NOT catch, unlike getUser: a session that was signed out or a user that was deleted keeps working
 * until the access token expires (1 hour at most). Admin routes therefore keep the live check
 * (see requireAdminUser → getUserIdFromBearer(..., { requireLiveSession: true })).
 *
 * The public keys are cached for 10 minutes per server instance. If our copy has no key for the token (a key
 * rotation), getClaims fetches the key set itself; for an HS256 token it falls back to getUser on its own.
 */

const JWKS_TTL_MS = 10 * 60 * 1000;
const JWKS_FETCH_TIMEOUT_MS = 5_000;

// Holds only the project's PUBLIC signing keys — the same for every team and user, so sharing it across requests
// cannot carry one team's data into another's.
const keyCache: { keys: JWK[]; fetchedAt: number; inflight: Promise<JWK[]> | null } = {
  keys: [],
  fetchedAt: 0,
  inflight: null,
};

async function fetchKeys(): Promise<JWK[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url) return [];
  const res = await fetch(`${url}/auth/v1/.well-known/jwks.json`, {
    headers: anon ? { apikey: anon } : undefined,
    signal: AbortSignal.timeout(JWKS_FETCH_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) return [];
  const body = (await res.json().catch(() => null)) as { keys?: JWK[] } | null;
  return Array.isArray(body?.keys) ? body.keys : [];
}

async function publicKeys(): Promise<JWK[]> {
  if (keyCache.keys.length && Date.now() - keyCache.fetchedAt < JWKS_TTL_MS) return keyCache.keys;
  if (!keyCache.inflight) {
    keyCache.inflight = fetchKeys()
      .then((keys) => {
        if (keys.length) {
          keyCache.keys = keys;
          keyCache.fetchedAt = Date.now();
        }
        return keys;
      })
      .catch(() => [] as JWK[])
      .finally(() => {
        keyCache.inflight = null;
      });
  }
  const keys = await keyCache.inflight;
  // A failed refresh keeps the last good keys rather than forcing every request onto the slow path.
  return keys.length ? keys : keyCache.keys;
}

/** Test hook: forget the cached keys. */
export function resetVerifiedTokenKeyCache() {
  keyCache.keys = [];
  keyCache.fetchedAt = 0;
  keyCache.inflight = null;
}

/**
 * The user id (`sub`) of a valid, unexpired, correctly signed user access token, or null.
 * Tokens without a user (the anon key, the service key) return null.
 */
export async function verifiedUserIdFromToken(sb: SupabaseClient, token: string): Promise<string | null> {
  if (!token) return null;
  const keys = await publicKeys();
  try {
    const { data, error } = await sb.auth.getClaims(token, keys.length ? { jwks: { keys } } : undefined);
    if (error || !data?.claims) return null;
    const sub = typeof data.claims.sub === "string" ? data.claims.sub : "";
    if (!sub || data.claims.role !== "authenticated") return null;
    return sub;
  } catch {
    // Not an auth error (e.g. the key set could not be fetched): fall back to the live check rather than refuse.
    const { data, error } = await sb.auth.getUser(token);
    return !error && data?.user?.id ? data.user.id : null;
  }
}
