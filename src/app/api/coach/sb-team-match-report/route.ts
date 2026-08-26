export const runtime = "nodejs";

/**
 * GET /api/coach/sb-team-match-report?date=YYYY-MM-DD
 *
 * The readable "Team match stats" report for one game — the StatsBomb team-aggregated numbers
 * for the selected match (sb_team_match_stats), plus the team's season rows so the report can show
 * each metric vs the team's own average. Descriptive football context — never touches readiness.
 * Read-only, strictly scoped to the coach's own team.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { buildSbTeamMatchReport, type SbTeamRow } from "@/lib/micropulse/matchReport/sbTeamMatchReport";
import { aggregateSbTeamFromPlayers } from "@/lib/micropulse/matchReport/sbTeamFromPlayers";

export async function GET(req: NextRequest) {
  const supabase = getSupabaseServer();
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (!token) return NextResponse.json({ ok: false, error: "Missing auth" }, { status: 401 });
  const { data: userRes } = await supabase.auth.getUser(token);
  if (!userRes?.user) return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 401 });
  const { data: prof } = await supabase.from("profiles").select("team_id").eq("id", userRes.user.id).maybeSingle();
  const teamId = (prof as { team_id?: string } | null)?.team_id ?? null;
  if (!teamId) return NextResponse.json({ ok: false, error: "Coach not linked to a team" }, { status: 400 });
  const { data: team } = await supabase.from("teams").select("name").eq("id", teamId).maybeSingle();
  const teamName = (team as { name?: string } | null)?.name ?? null;

  const date = String(req.nextUrl.searchParams.get("date") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ ok: false, error: "A match date (YYYY-MM-DD) is required." }, { status: 400 });

  const { data: rows } = await supabase
    .from("sb_team_match_stats")
    .select("*")
    .eq("team_id", teamId)
    .eq("source", "statsbomb")
    .order("match_date", { ascending: false });

  const season = (rows ?? []) as SbTeamRow[];
  const match = season.find((r) => r.match_date === date) ?? null;
  if (!match) return NextResponse.json({ ok: true, hasData: false, date });

  // Fill the team metrics the team-stats file lacks by aggregating the per-player
  // StatsBomb "Match Stats" rows already imported for this game (pressures,
  // crosses, key passes, OBV components, long balls, aerials...). Only fills
  // columns that are currently empty — a real team file always wins.
  const { data: playerRows } = await supabase
    .from("player_match_stats")
    .select("metrics")
    .eq("team_id", teamId).eq("match_date", date).eq("source", "statsbomb_match_report");
  const derived = aggregateSbTeamFromPlayers(((playerRows ?? []) as Array<{ metrics: Record<string, unknown> | null }>).map((r) => r.metrics ?? {}));
  const enriched = { ...match } as Record<string, unknown>;
  for (const [k, v] of Object.entries(derived)) {
    if (enriched[k] == null) enriched[k] = v;
  }

  const report = buildSbTeamMatchReport(enriched as SbTeamRow, season);
  return NextResponse.json({ ok: true, hasData: true, report, teamName });
}
