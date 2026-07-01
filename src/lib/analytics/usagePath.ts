/**
 * Normalise a route path for usage analytics.
 *
 * Two jobs:
 *  1. Privacy — strip dynamic id segments (UUIDs, numeric ids) so we never
 *     store player/team ids in the analytics table. `/coach/player/<uuid>/summary`
 *     becomes `/coach/player/:id/summary`.
 *  2. Aggregation — collapse every player-detail view onto one row so the
 *     "what's used / what's dead" report counts the SURFACE, not each player.
 *
 * Query string and hash are dropped.
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function normalizeUsagePath(rawPath: string | null | undefined): string {
  const path = (rawPath || "/").split("?")[0].split("#")[0];
  const segs = path.split("/").map((s) => {
    if (!s) return s;
    if (UUID_RE.test(s)) return ":id";
    if (/^\d+$/.test(s)) return ":id"; // numeric id
    return s;
  });
  const out = segs.join("/") || "/";
  // drop a trailing slash (but keep the root "/")
  return out.length > 1 && out.endsWith("/") ? out.slice(0, -1) : out;
}
