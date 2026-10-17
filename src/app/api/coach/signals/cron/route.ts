export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * GET /api/coach/signals/cron
 *
 * Nightly pre-compute of the Today coach-signal cache for every active team. Moves
 * the heavy per-player fan-out compute (robustness, CMJ fatigue, recovery, stride,
 * sprint, ACWR, …) OFF the coach's first Today load of the day and onto a schedule,
 * so that first load is a cache hit instead of a per-player query storm. Uses the
 * same tokenless `computeTeamSignals` the on-demand route uses, so the cached
 * result is identical. Cron-gated (Bearer CRON_SECRET / x-cron-secret / ?secret);
 * no secret configured → allowed (dev). Service-role; never the readiness colour.
 */

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { computeTeamSignals, writeTeamSignals } from "@/lib/micropulse/coachSignals/computeTeam";

function isAuthorized(req: Request): boolean {
  const accepted = [process.env.CRON_SECRET, process.env.SIGNALS_CRON_SECRET]
    .map((s) => (s ?? "").trim()).filter(Boolean);
  if (accepted.length === 0) return true; // dev
  const url = new URL(req.url);
  const auth = req.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const provided = bearer || req.headers.get("x-cron-secret") || url.searchParams.get("secret") || "";
  return provided !== "" && accepted.includes(provided);
}

function todayInReykjavik(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Atlantic/Reykjavik" }).format(new Date());
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const sb = getSupabaseAdmin();
  const today = todayInReykjavik();

  // Every team that has an active roster (compute degrades to steady/empty for a
  // team with no data, so this is safe to run squad-wide).
  const { data: rosterTeams } = await sb.from("players").select("team_id").eq("is_active", true);
  const teamIds = Array.from(new Set(((rosterTeams ?? []) as Array<{ team_id: string | null }>)
    .map((r) => r.team_id).filter((t): t is string => !!t)));

  const results: Array<{ teamId: string; ok: boolean; signals?: number; error?: string }> = [];
  const CONCURRENCY = 3;
  for (let i = 0; i < teamIds.length; i += CONCURRENCY) {
    const chunk = teamIds.slice(i, i + CONCURRENCY);
    const settled = await Promise.all(chunk.map(async (teamId) => {
      try {
        const signals = await computeTeamSignals(sb, teamId, today);
        await writeTeamSignals(sb, teamId, today, signals);
        return { teamId, ok: true, signals: signals.length };
      } catch (e) {
        return { teamId, ok: false, error: e instanceof Error ? e.message : "compute failed" };
      }
    }));
    results.push(...settled);
  }

  const okCount = results.filter((r) => r.ok).length;
  return NextResponse.json({ ok: results.every((r) => r.ok), asOf: today, teams: teamIds.length, computed: okCount, results });
}
