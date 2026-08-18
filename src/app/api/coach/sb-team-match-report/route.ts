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

  const report = buildSbTeamMatchReport(match, season);
  return NextResponse.json({ ok: true, hasData: true, report, teamName });
}
