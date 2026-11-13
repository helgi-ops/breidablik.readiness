import "server-only";

import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { tokenNeedsCode } from "@/lib/auth/twoStep";
import { needsMfaStep } from "@/lib/auth/mfaText";
import { verifiedUserIdFromToken } from "@/lib/auth/verifyAccessToken";

function bearerFromRequest(req: Request) {
  const auth = req.headers.get("authorization") || "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : "";
}

async function getUserIdFromCookieSession(): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;

  const cookieStore = await cookies();
  const serverClient = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll().map((c) => ({ name: c.name, value: c.value }));
      },
      setAll(cookiesToSet) {
        try {
          for (const c of cookiesToSet) {
            cookieStore.set(c.name, c.value, c.options);
          }
        } catch {
          // Read-only cookie contexts are valid in some route executions.
          // In that case we still allow server-side auth reads via existing cookies.
        }
      },
    },
  });

  const { data, error } = await serverClient.auth.getUser();
  if (error || !data?.user?.id) return null;

  // Two-step sign-in: a session that still owes a code gets no user (docs/security/admin-mfa.md).
  const { data: sessionData } = await serverClient.auth.getSession();
  if (tokenNeedsCode(sessionData.session?.access_token)) return null;
  const { data: aal } = await serverClient.auth.mfa.getAuthenticatorAssuranceLevel();
  if (needsMfaStep(aal)) return null;
  return data.user.id;
}

/**
 * The signed-in user's id from the request's Bearer token (or the cookie session when there is none).
 *
 * The token is verified locally (signature + expiry, see verifiedUserIdFromToken) instead of calling Supabase Auth on
 * every request. Pass `requireLiveSession: true` where a signed-out session must stop working at once rather than
 * when its token expires (admin routes).
 */
export async function getUserIdFromBearer(
  sb: SupabaseClient,
  req: Request,
  opts?: { requireLiveSession?: boolean },
): Promise<string | null> {
  const token = bearerFromRequest(req);
  if (!token) {
    return getUserIdFromCookieSession();
  }

  // The proxy refuses these too; checked here as well so the helper never vouches for a session owing a code.
  if (tokenNeedsCode(token)) return null;
  if (opts?.requireLiveSession) {
    const { data, error } = await sb.auth.getUser(token);
    if (!error && data?.user?.id) return data.user.id;
  } else {
    const userId = await verifiedUserIdFromToken(sb, token);
    if (userId) return userId;
  }

  return getUserIdFromCookieSession();
}

export async function requireCoachUserId(sb: SupabaseClient, req: Request): Promise<string> {
  const userId = await getUserIdFromBearer(sb, req);
  if (!userId) {
    throw new Error("Unauthorized");
  }

  const { data, error } = await sb.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (error) throw new Error(error.message);

  const role = String((data as { role?: string | null } | null)?.role ?? "").toUpperCase();
  const isCoach = role === "COACH" || role === "ADMIN" || role === "STAFF";
  if (!isCoach) {
    throw new Error("Forbidden");
  }

  return userId;
}

/**
 * user id → player id, kept 60 s per server instance. Every player API route resolves this, so one app open
 * repeated the same `players` lookup ~8 times (13 Nov 2026, 09:01). Only found links are cached, so a player who
 * links their account is picked up on the next request; a re-link to another player shows within a minute.
 */
const PLAYER_LINK_TTL_MS = 60_000;
const PLAYER_LINK_MAX = 1000;
const playerLinkCache = new Map<string, { playerId: string; at: number }>();

/** Test hook. */
export function resetPlayerLinkCache() {
  playerLinkCache.clear();
}

export async function resolvePlayerIdForUser(sb: SupabaseClient, userId: string): Promise<string | null> {
  const hit = playerLinkCache.get(userId);
  if (hit && Date.now() - hit.at < PLAYER_LINK_TTL_MS) return hit.playerId;
  const found = await lookupPlayerIdForUser(sb, userId);
  if (found) {
    if (playerLinkCache.size >= PLAYER_LINK_MAX) playerLinkCache.clear();
    playerLinkCache.set(userId, { playerId: found, at: Date.now() });
  }
  return found;
}

async function lookupPlayerIdForUser(sb: SupabaseClient, userId: string): Promise<string | null> {
  const { data: byPlayers, error: byPlayersErr } = await sb.from("players").select("id").eq("user_id", userId).maybeSingle();
  if (byPlayersErr) throw new Error(byPlayersErr.message);

  const playerFromPlayers = (byPlayers as { id?: string | null } | null)?.id ?? null;
  if (playerFromPlayers) return playerFromPlayers;

  const { data: byProfile, error: byProfileErr } = await sb
    .from("profiles")
    .select("player_id")
    .eq("id", userId)
    .maybeSingle();

  if (byProfileErr) throw new Error(byProfileErr.message);
  return (byProfile as { player_id?: string | null } | null)?.player_id ?? null;
}
