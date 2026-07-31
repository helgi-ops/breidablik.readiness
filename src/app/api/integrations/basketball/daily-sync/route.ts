import { NextResponse } from "next/server";
import { getSupabaseServer as getAdminClient } from "@/lib/supabaseServer";
import { syncBasketballTeam } from "@/lib/integrations/basketball/sync";

export const runtime = "nodejs";

/**
 * /api/integrations/basketball/daily-sync  (scheduled)
 *
 * Secured like the Wyscout/Catapult daily-syncs: a cron secret
 * (BASKETBALL_CRON_SECRET via x-cron-secret header or ?secret=) OR an authorized
 * coach. Never an open endpoint. Pulls the basketball feed for every team
 * configured with source 'baskethotel' and upserts per-game rows + a season
 * rollup via the shared normalized path.
 *
 * NOTE: the actual feed HTTP fetch is not implemented yet (needs the chosen clean
 * feed's docs) — syncBasketballTeam returns { ok:false, reason:'not_implemented' }
 * per team until that seam is filled, so this route is intentionally NOT wired
 * into vercel.json crons yet (no daily failing job). It is ready to schedule the
 * moment the fetch seam lands.
 */

function isCronAuthorized(request: Request): boolean {
  // Mirror the Catapult cron: fail OPEN when no secret is set, so the Vercel cron
  // authorizes without committing a secret to vercel.json. The endpoint only
  // triggers an idempotent, descriptive-only re-sync of teams the coach already
  // configured (source='baskethotel', enabled) — no data exposure. Set
  // BASKETBALL_CRON_SECRET to lock it down (then pass ?secret= / x-cron-secret).
  const expected = process.env.BASKETBALL_CRON_SECRET?.trim();
  if (!expected) return true;
  const url = new URL(request.url);
  const provided = request.headers.get("x-cron-secret") || url.searchParams.get("secret") || "";
  return provided === expected;
}

async function isAuthorizedCoach(request: Request): Promise<boolean> {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return false;
  const sb = getAdminClient();
  const { data: userRes, error } = await sb.auth.getUser(token);
  if (error || !userRes?.user?.id) return false;
  const { data: prof } = await sb.from("profiles").select("role").eq("id", userRes.user.id).maybeSingle();
  const role = String((prof as { role: string | null } | null)?.role ?? "").toUpperCase();
  return role === "COACH" || role === "ADMIN" || role === "STAFF";
}

async function run(request: Request) {
  if (!isCronAuthorized(request) && !(await isAuthorizedCoach(request))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const sb = getAdminClient();
  const url = new URL(request.url);
  const season = (url.searchParams.get("season") || String(new Date().getUTCFullYear())).trim();

  const { data: configs, error } = await sb
    .from("stat_ingestion_config")
    .select("team_id")
    .eq("source", "baskethotel")
    .eq("enabled", true);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const teamIds = (configs ?? []).map((c) => (c as { team_id: string }).team_id);
  const results = [];
  for (const teamId of teamIds) {
    try {
      results.push(await syncBasketballTeam(sb, teamId, season));
    } catch (e) {
      results.push({ teamId, ok: false, reason: "fetch_failed" as const, detail: e instanceof Error ? e.message : "error" });
    }
  }

  return NextResponse.json({ ok: results.every((r) => r.ok), season, teams: teamIds.length, results });
}

export async function GET(request: Request) { return run(request); }
export async function POST(request: Request) { return run(request); }
