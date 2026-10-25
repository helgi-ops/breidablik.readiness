export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/coach/basketball-best-matches
 *
 * The basketball counterpart to /api/coach/best-matches (which ranks football StatsBomb games). Ranks the
 * team's OWN games of the CURRENT season best-first (by scoring margin) from the stored KKÍ/FIBA box
 * scores (basketball_fiba_games), with the "what we did well" numbers per game (eFG%, FG/3P%, assists,
 * top scorer). Descriptive — never the readiness colour. Coach-scoped.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { scopeToCurrentSeason, totalsPts, pctOf, competitionsOf, resolveCompetition, type FibaGame, type FibaBoxRow } from "@/lib/micropulse/basketballStats/fibaGamesRead";

const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

async function authTeam(req: NextRequest) {
  const supabase = getSupabase();
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (!token) return { error: "Missing auth", status: 401 } as const;
  const { data: userRes } = await supabase.auth.getUser(token);
  if (!userRes?.user) return { error: "Invalid token", status: 401 } as const;
  const { data: prof } = await supabase.from("profiles").select("team_id, role").eq("id", userRes.user.id).maybeSingle();
  const role = String((prof as { role?: string } | null)?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Coach role required", status: 403 } as const;
  const teamId = (prof as { team_id?: string } | null)?.team_id ?? null;
  if (!teamId) return { error: "Coach not linked to a team", status: 400 } as const;
  return { supabase, teamId } as const;
}

export async function GET(req: NextRequest) {
  const ctx = await authTeam(req);
  if ("error" in ctx) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
  const { supabase, teamId } = ctx;

  const { data } = await supabase.from("basketball_fiba_games")
    .select("match_id, match_date, opp_name, own_box, own_totals, opp_totals, competition_code, season")
    .eq("owner_team_id", teamId);
  const { season, games: all } = scopeToCurrentSeason(((data ?? []) as FibaGame[]));
  if (all.length === 0) return NextResponse.json({ ok: true, hasData: false, season, games: [], record: null, competitions: [], competition: null });

  // Separate the main team from a reserve side (different teams) — rank within one competition.
  const competitions = competitionsOf(all);
  const competition = resolveCompetition(all, new URL(req.url).searchParams.get("competition"));
  const scoped = competitions.length > 1 ? all.filter((g) => (g.competition_code ?? null) === competition) : all;

  const games = scoped.map((g) => {
    const tot = (g.own_totals ?? {}) as Record<string, number>;
    const ownPts = totalsPts(g.own_totals) || (Array.isArray(g.own_box) ? g.own_box.reduce((a, b: FibaBoxRow) => a + n(b.pts), 0) : 0);
    const oppPts = totalsPts(g.opp_totals);
    const fgm = n(tot.fgm), fga = n(tot.fga), tpm = n(tot.tpm), tpa = n(tot.tpa), ftm = n(tot.ftm), fta = n(tot.fta);
    // Top scorer from the box.
    const box = Array.isArray(g.own_box) ? g.own_box : [];
    const topScorer = box.reduce<{ name: string; pts: number } | null>((best, b: FibaBoxRow) => {
      const p = n(b.pts); return !best || p > best.pts ? { name: (b.name ?? "—"), pts: p } : best;
    }, null);
    const margin = oppPts || ownPts ? ownPts - oppPts : null;
    return {
      gameId: String(g.match_id ?? ""), date: g.match_date, opponent: g.opp_name ?? "—", competition: g.competition_code ?? null,
      ownPts, oppPts, margin, result: margin == null ? null : margin > 0 ? "W" : margin < 0 ? "L" : "T",
      efgPct: pctOf(fgm + 0.5 * tpm, fga), fgPct: pctOf(fgm, fga), tpPct: pctOf(tpm, tpa), ftPct: pctOf(ftm, fta),
      reb: n(tot.reb), ast: n(tot.ast), stl: n(tot.stl), tov: n(tot.tov), tpm,
      topScorer: topScorer && topScorer.pts > 0 ? topScorer : null,
    };
  });
  // Best first: by margin desc (wins, biggest first), undated/unknown-score last.
  games.sort((a, b) => (b.margin ?? -9999) - (a.margin ?? -9999));

  const decided = games.filter((g) => g.result === "W" || g.result === "L");
  const wins = decided.filter((g) => g.result === "W").length;
  const avgMargin = decided.length ? Math.round((decided.reduce((a, g) => a + (g.margin ?? 0), 0) / decided.length) * 10) / 10 : null;

  return NextResponse.json({ ok: true, hasData: true, season, games, record: { wins, losses: decided.length - wins, avgMargin }, competitions: competitions.length > 1 ? competitions : [], competition });
}
