/**
 * Request limits for the routes where volume costs money or CPU, or where nobody has logged in yet.
 *
 * Not every API route: a shared counter means a database write per request, and coach screens fire many reads
 * at once. Login attempts go straight to Supabase Auth, which has its own limits.
 *
 * Two counters per request: one per login token, one per IP address. The IP limit is higher because a whole
 * squad can share one network. Counts are stored against hashes only (migration 20261109140500).
 *
 * The limiter fails OPEN: if the database is slow or down the request goes through. An outage of the counter
 * must never take the coach's screens down with it.
 *
 * Every path here must also be in the matcher in src/proxy.ts (a test checks this).
 */

export type RuleName = "ai" | "upload" | "public_form" | "invite";

type Rule = { name: RuleName; windowSec: number; perToken: number | null; perIp: number };

const TEN_MINUTES = 600;

export const RULES: Record<RuleName, Rule> = {
  ai: { name: "ai", windowSec: TEN_MINUTES, perToken: 120, perIp: 400 },
  upload: { name: "upload", windowSec: TEN_MINUTES, perToken: 120, perIp: 400 },
  public_form: { name: "public_form", windowSec: TEN_MINUTES, perToken: null, perIp: 5 },
  invite: { name: "invite", windowSec: TEN_MINUTES, perToken: null, perIp: 120 },
};

const WRITE = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const ANY = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

/** Routes that call an AI model on write. Their GET only reads a saved result, so it stays free. */
export const AI_WRITE_PATHS = [
  "/api/coach/basketball-fiba",
  "/api/coach/basketball-film-clip",
  "/api/coach/basketball-game-summary",
  "/api/coach/basketball-match-insights",
  "/api/coach/basketball-opponent-scout",
  "/api/coach/basketball-player-analysis",
  "/api/coach/basketball-season-summary",
  "/api/coach/basketball-total-player-analysis",
  "/api/coach/best-matches/ai-summary",
  "/api/coach/clinical-reports/:id/extract",
  "/api/coach/custom-templates/analyze",
  "/api/coach/drill-library/link-read",
  "/api/coach/drill-library/video-read",
  "/api/coach/goalkeeper-analysis",
  "/api/coach/ksi-report/ai",
  "/api/coach/library/meetings/read-pdf",
  "/api/coach/load-verdict/explain",
  "/api/coach/match-minutes/read-lineup",
  "/api/coach/match-movement/narrative",
  "/api/coach/match-report-read",
  "/api/coach/match-review",
  "/api/coach/movement-analysis",
  "/api/coach/notifications/:id/player-message",
  "/api/coach/opponent-player-analysis",
  "/api/coach/player-analysis",
  "/api/coach/player-game-report/narrative",
  "/api/coach/player-stats/narrative",
  "/api/coach/player/:id/ai-strength-refinement",
  "/api/coach/player/:id/ask",
  "/api/coach/player/:id/decel-summary",
  "/api/coach/player/:id/summary",
  "/api/coach/position-comparison/narrative",
  "/api/coach/rtp/narrative",
  "/api/coach/sb-team-match-report/narrative",
  "/api/coach/scouting/play-diagrams/draft-coverage",
  "/api/coach/scouting/play-diagrams/reconstruct-from-image",
  "/api/coach/season-report",
  "/api/coach/team-analysis",
  "/api/coach/team-season-report",
  "/api/coach/transfer-report/:id",
  "/api/coach/weekly-story",
  "/api/player/basketball-ai-summary",
  "/api/player/game-report/narrative",
  "/api/player/match-movement/narrative",
  "/api/player/why-flagged-ai",
  "/api/pt/reports/:id/extract",
  "/api/trainer/client/:id/corrective",
] as const;

/** Routes that call an AI model on GET. */
export const AI_READ_PATHS = [
  "/api/client/ai-coach",
  "/api/coach/scouting/opponent",
  "/api/coach/total-player-analysis",
  "/api/trainer/client/:id/summary",
] as const;

/** Routes that parse an uploaded spreadsheet or report, which is heavy and runs a third-party parser. */
export const UPLOAD_PATHS = [
  "/api/coach/basketball-opponent-scout/import",
  "/api/coach/basketball-stats/upload",
  "/api/coach/load/peak-period/upload",
  "/api/coach/load/peak-window/upload",
  "/api/coach/match-report/upload",
  "/api/coach/pass-network/upload",
  "/api/coach/player-stats/upload",
  "/api/coach/sb-match-summary/upload",
  "/api/coach/sb-team-stats-file/upload",
  "/api/coach/scouting/players-import",
  "/api/coach/scouting/upload",
  "/api/coach/stats/smart-import",
  "/api/coach/team-match-stats/upload",
] as const;

export const PUBLIC_FORM_PATHS = ["/api/public/demo-request"] as const;

/** Reached without a login: the token in the link is the credential, so limit how fast links can be guessed. */
export const INVITE_PATHS = [
  "/api/client-invites/:path*",
  "/api/coach-invites/:path*",
  "/api/exec-invites/:path*",
  "/api/team-invites/:path*",
] as const;

/** `/api/x/:id/y` → regex; `/:path*` at the end matches the path and everything under it. */
export function toRegex(pattern: string): RegExp {
  const body = pattern
    .replace(/\/:path\*$/, "(?:/.*)?")
    .replace(/:[a-zA-Z]+/g, "[^/]+");
  return new RegExp(`^${body}/?$`);
}

function compile(paths: readonly string[], name: RuleName, methods: Set<string>) {
  return paths.map((path) => ({ regex: toRegex(path), name, methods }));
}

const TABLE = [
  ...compile(PUBLIC_FORM_PATHS, "public_form", WRITE),
  ...compile(INVITE_PATHS, "invite", ANY),
  ...compile(AI_WRITE_PATHS, "ai", WRITE),
  ...compile(AI_READ_PATHS, "ai", ANY),
  ...compile(UPLOAD_PATHS, "upload", WRITE),
];

/** Which limit applies to this request, or null if none does. */
export function ruleFor(pathname: string, method: string): Rule | null {
  const hit = TABLE.find((row) => row.methods.has(method) && row.regex.test(pathname));
  return hit ? RULES[hit.name] : null;
}

async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

type Hit = { allowed: boolean; retry_after: number };

async function hit(
  fetchImpl: typeof fetch,
  env: { url: string; key: string },
  args: { bucket: string; subject: string; windowSec: number; max: number },
): Promise<Hit | null> {
  try {
    const res = await fetchImpl(`${env.url}/rest/v1/rpc/rate_limit_hit`, {
      method: "POST",
      headers: { apikey: env.key, Authorization: `Bearer ${env.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        p_bucket: args.bucket,
        p_subject: await sha256(args.subject),
        p_window_seconds: args.windowSec,
        p_max: args.max,
      }),
      signal: AbortSignal.timeout(1000),
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as Hit[];
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

/** Seconds to wait if the request is over a limit, otherwise null. Any counter failure counts as "not over". */
export async function secondsUntilAllowed(
  rule: Rule,
  who: { token: string | null; ip: string | null },
  deps: { fetchImpl?: typeof fetch; env?: { url?: string; key?: string } } = {},
): Promise<number | null> {
  const url = deps.env?.url ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = deps.env?.key ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) return null;
  const env = { url, key };
  const fetchImpl = deps.fetchImpl ?? fetch;

  const checks: Array<Promise<Hit | null>> = [];
  if (who.ip) {
    checks.push(hit(fetchImpl, env, { bucket: `${rule.name}:ip`, subject: who.ip, windowSec: rule.windowSec, max: rule.perIp }));
  }
  if (who.token && rule.perToken != null) {
    checks.push(hit(fetchImpl, env, { bucket: `${rule.name}:token`, subject: who.token, windowSec: rule.windowSec, max: rule.perToken }));
  }

  const over = (await Promise.all(checks)).filter((r): r is Hit => r != null && !r.allowed);
  return over.length ? Math.max(...over.map((r) => r.retry_after)) : null;
}
