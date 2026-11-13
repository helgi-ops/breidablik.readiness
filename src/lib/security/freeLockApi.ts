/**
 * FREE lock for API routes: a club team on the FREE plan (trials ended Nov 2026) gets 402 on the routes that cost
 * money, send something to players, or pull data in: AI, strength/corrective sends, uploads and syncs, and the
 * paid signal reads behind the Today cards. The coach app already hides these screens (src/lib/micropulse/product/
 * freeLock.ts); this stops a direct call too.
 *
 * Who is locked is decided in the database (`free_locked_for_user`, migration 20261110220000): the caller's current
 * team is FREE and not a personal-trainer practice. PRO/ELITE and PT teams are never refused.
 *
 * Fails OPEN: no login token, a token that is not a JWT (cron secrets), a slow or failed lookup → the request goes
 * through to the route, which does its own auth. Only a positive "this team is FREE-locked" refuses. A paying club
 * must never lose a screen because this check had a bad moment.
 *
 * Still open (Lota 2): plain READS of other PRO data. Turning this into an allow-list needs the real call list.
 */
import { AI_READ_PATHS, AI_WRITE_PATHS, UPLOAD_PATHS, toRegex } from "./rateLimit";
import { decodeJwtClaims } from "@/lib/auth/twoStep";

const WRITE = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const ANY = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

/** Sends to players and imports that are not in the rate-limit lists. */
export const FREE_BLOCKED_SEND_PATHS = [
  "/api/coach/team/send-strength-sessions",
  "/api/coach/player/:id/send-strength-session",
  "/api/coach/player/:id/send-strength-block",
  "/api/coach/movement-screen/corrective",
  "/api/coach/scouting/share",
  "/api/coach/external-load/upload",
  "/api/coach/import-drills",
  "/api/coach/integrations/assessment-upload",
  "/api/coach/integrations/vald-upload",
  "/api/coach/library/media/upload",
  "/api/coach/load/peak-context/upload",
  "/api/coach/scouting/player-clips/upload",
  "/api/integrations/kinexon/upload",
  "/api/integrations/titan/upload",
  "/api/integrations/wimu/upload",
] as const;

/** Data pulls from vendors (any method: some are GET). Cron callers carry a secret, not a login, so they pass. */
export const FREE_BLOCKED_SYNC_PATHS = [
  "/api/integrations/catapult/daily-sync",
  "/api/integrations/catapult/backfill",
  "/api/integrations/basketball/daily-sync",
  "/api/integrations/statsport/daily-sync",
  "/api/integrations/wyscout/daily-sync",
  "/api/integrations/titan/daily-sync",
  "/api/integrations/vald/sync",
  "/api/integrations/vald/resync",
  "/api/integrations/gymaware/sync",
  "/api/integrations/polar/sync",
  "/api/integrations/whoop/sync",
  "/api/integrations-live/sync/trigger",
  "/api/team/schedule/sync-sheet",
  "/api/player/vbt/sync",
] as const;

/** Paid reads behind the Today cards that FREE does not show. */
export const FREE_BLOCKED_READ_PATHS = [
  "/api/coach/signals",
  "/api/coach/unfamiliar-load",
  "/api/coach/player/:id/trend-forecast",
  "/api/coach/player/:id/robustness-watch",
  "/api/coach/goal-plans/:id/preview",
] as const;

const TABLE = [
  ...AI_WRITE_PATHS.map((p) => ({ regex: toRegex(p), methods: WRITE })),
  ...AI_READ_PATHS.map((p) => ({ regex: toRegex(p), methods: ANY })),
  ...UPLOAD_PATHS.map((p) => ({ regex: toRegex(p), methods: WRITE })),
  ...FREE_BLOCKED_SEND_PATHS.map((p) => ({ regex: toRegex(p), methods: WRITE })),
  ...FREE_BLOCKED_SYNC_PATHS.map((p) => ({ regex: toRegex(p), methods: ANY })),
  ...FREE_BLOCKED_READ_PATHS.map((p) => ({ regex: toRegex(p), methods: ANY })),
];

/** True when this route is closed to FREE-locked teams. */
export function isFreeBlockedApi(pathname: string, method: string): boolean {
  return TABLE.some((row) => row.methods.has(method) && row.regex.test(pathname));
}

const CACHE_MS = 60_000;
const cache = new Map<string, { locked: boolean; at: number }>();

async function lockedForUser(
  userId: string,
  fetchImpl: typeof fetch,
  env: { url: string; key: string },
): Promise<boolean> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.locked;
  try {
    const res = await fetchImpl(`${env.url}/rest/v1/rpc/free_locked_for_user`, {
      method: "POST",
      headers: { apikey: env.key, Authorization: `Bearer ${env.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_user_id: userId }),
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return false;
    const locked = (await res.json()) === true;
    if (cache.size > 2000) cache.clear();
    cache.set(userId, { locked, at: Date.now() });
    return locked;
  } catch {
    return false;
  }
}

/**
 * True when the request must get 402: the route is on the list AND a login token in the request belongs to a user
 * whose current team is FREE-locked. Every token is checked (header and cookies), so a second token cannot be
 * used to slip past.
 */
export async function isFreeLockedRequest(
  req: { pathname: string; method: string; tokens: Array<string | null | undefined> },
  deps: { fetchImpl?: typeof fetch; env?: { url?: string; key?: string } } = {},
): Promise<boolean> {
  if (!isFreeBlockedApi(req.pathname, req.method)) return false;
  const url = deps.env?.url ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = deps.env?.key ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) return false;
  const userIds = new Set<string>();
  for (const t of req.tokens) {
    const sub = decodeJwtClaims(t)?.sub;
    if (typeof sub === "string" && /^[0-9a-f-]{36}$/i.test(sub)) userIds.add(sub);
  }
  if (userIds.size === 0) return false;
  const results = await Promise.all(
    [...userIds].map((id) => lockedForUser(id, deps.fetchImpl ?? fetch, { url, key })),
  );
  return results.some(Boolean);
}

/** Clears the 60 s cache (tests). */
export function clearFreeLockCache(): void {
  cache.clear();
}
