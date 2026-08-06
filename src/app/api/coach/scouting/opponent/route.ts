export const runtime = "nodejs";

/**
 * /api/coach/scouting/opponent
 *   ?list=1                    → the scouted opponents this team has (picker)
 *   ?opponent=&season=         → the full OpponentReport, benchmarked against league + own team
 *
 * Team-scoped (COACH/ADMIN/STAFF). Descriptive context only — never touches readiness.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { buildOpponentReport, type Metrics, type ScoutMatch, type ScoutPlayerRow } from "@/lib/micropulse/scouting/opponentReport";
import { metricsFromRows, metricsFromScoutRow } from "@/lib/micropulse/scouting/aggregate";

const num = (v: unknown): number | null => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

async function auth(req: NextRequest) {
  const supabase = getSupabase();
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (!token) return { error: "Missing auth", status: 401 } as const;
  const { data: userRes } = await supabase.auth.getUser(token);
  if (!userRes?.user) return { error: "Invalid token", status: 401 } as const;
  const { data: prof } = await supabase.from("profiles").select("team_id, role").eq("id", userRes.user.id).maybeSingle();
  const role = String(prof?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Coach role required", status: 403 } as const;
  const teamId = prof?.team_id as string | null;
  if (!teamId) return { error: "Coach not linked to a team", status: 400 } as const;
  return { teamId, supabase } as const;
}

export async function GET(req: NextRequest) {
  const ctx = await auth(req);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { teamId, supabase } = ctx;
  const url = new URL(req.url);

  if (url.searchParams.get("list")) {
    const { data } = await supabase.from("scout_team_season")
      .select("opponent_name, season, matches, updated_at")
      .eq("owner_team_id", teamId).order("updated_at", { ascending: false });
    return NextResponse.json({ ok: true, opponents: data ?? [] });
  }

  const opponent = (url.searchParams.get("opponent") ?? "").trim();
  const season = (url.searchParams.get("season") ?? "").trim();
  if (!opponent || !season) return NextResponse.json({ ok: false, error: "opponent and season are required" }, { status: 400 });

  const { data: row } = await supabase.from("scout_team_season").select("*")
    .eq("owner_team_id", teamId).eq("opponent_name", opponent).eq("season", season).maybeSingle();
  if (!row) return NextResponse.json({ ok: false, error: "No scouting for that opponent/season yet." }, { status: 404 });
  const seasonId = (row as { id: string }).id;

  const [{ data: matchRows }, { data: playerRows }, { data: ownRows }, { data: leagueRows }] = await Promise.all([
    supabase.from("scout_team_match").select("match_date, opponent, is_home, goals, goals_against, xg, xg_against, result").eq("scout_team_season_id", seasonId),
    supabase.from("scout_player").select("player_name, position, minutes, goals, xg, assists, xa, received_passes").eq("scout_team_season_id", seasonId),
    supabase.from("team_match_stats").select("is_opponent, xg, goals, shots, possession_pct, ppda, def_duels_won_pct, forward_passes, forward_pass_acc_pct, passes_final_third, passes_final_third_acc_pct, progressive_passes, smart_passes, smart_pass_acc_pct, crosses, cross_acc_pct, positional_attacks, counterattacks, offensive_duels_won_pct, match_date").eq("team_id", teamId),
    supabase.from("team_match_stats").select("is_opponent, xg, goals, shots, possession_pct, ppda, def_duels_won_pct, forward_passes, forward_pass_acc_pct, passes_final_third, passes_final_third_acc_pct, progressive_passes, smart_passes, smart_pass_acc_pct, crosses, cross_acc_pct, positional_attacks, counterattacks, offensive_duels_won_pct, match_date"),
  ]);

  const inSeason = (r: Record<string, unknown>) => String((r.match_date as string | null) ?? "").startsWith(season);
  const own: Metrics = metricsFromRows(((ownRows ?? []) as Array<Record<string, unknown> & { is_opponent: boolean | null }>).filter(inSeason));
  const league: Metrics = metricsFromRows(((leagueRows ?? []) as Array<Record<string, unknown> & { is_opponent: boolean | null }>).filter(inSeason));

  const matches: ScoutMatch[] = ((matchRows ?? []) as Record<string, unknown>[]).map((m) => ({
    date: String(m.match_date ?? ""), opponent: (m.opponent as string) ?? null, isHome: (m.is_home as boolean) ?? null,
    goals: num(m.goals), goalsAgainst: num(m.goals_against), xg: num(m.xg), xgAgainst: num(m.xg_against),
    result: (m.result as "W" | "D" | "L") ?? null,
  }));
  const players: ScoutPlayerRow[] = ((playerRows ?? []) as Record<string, unknown>[]).map((p) => ({
    name: String(p.player_name ?? ""), position: (p.position as string) ?? null,
    minutes: num(p.minutes), goals: num(p.goals), xg: num(p.xg), assists: num(p.assists), xa: num(p.xa), receivedPasses: num(p.received_passes),
  }));

  const { data: ownTeam } = await supabase.from("teams").select("name").eq("id", teamId).maybeSingle();
  const report = buildOpponentReport({
    opponent: { name: opponent, matches: num((row as { matches?: number }).matches) ?? matches.length, m: metricsFromScoutRow(row as Record<string, unknown>) },
    league, own, matches, players, season, ownName: (ownTeam as { name?: string } | null)?.name,
    position: (row as { league_position?: number | null }).league_position ?? null,
  });
  return NextResponse.json({ ok: true, report, updatedAt: (row as { updated_at?: string }).updated_at ?? null });
}
