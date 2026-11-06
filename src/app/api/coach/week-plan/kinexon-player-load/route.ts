export const runtime = "nodejs";

/**
 * /api/coach/week-plan/kinexon-player-load — per-player recent (28-day) averages of the
 * distinctive Kinexon variables (Changes of Orientation, Exertions, Mechanical Load) plus
 * Player Load / distance / HSR, for the Week Plan PDF's per-player table on a Kinexon team.
 * The means are TRAINING days only; `match` carries the mean of the player's own recorded matches
 * (last 60 days), so the PDF can print Training + Matches = Week.
 *
 * The Kinexon variables live in raw_payload_json; we read the blob SERVER-side via the
 * Kinexon catalog and return only compact numbers (never ship the blob to the client — see
 * the raw_payload_json select trap). Returns { isKinexon:false, players:[] } for other teams.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { KINEXON_CATALOG, readKinexonMetric, type KinexonMetric } from "@/lib/integrations/kinexon/metricCatalog";
import { aggregateKinexonWeekPlanLoad, type KinexonLoadRow } from "@/lib/integrations/kinexon/weekPlanLoad";

/** How far back a recorded match still counts toward a player's match mean (home games only, so keep it wide). */
const MATCH_WINDOW_DAYS = 60;

const BY_KEY: Record<string, KinexonMetric> = {};
for (const g of KINEXON_CATALOG) for (const m of g.metrics) BY_KEY[m.key] = m;

async function requireCoach(req: NextRequest) {
  const sb = getSupabase();
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return { error: "Missing auth", status: 401 as const };
  const { data: userRes } = await sb.auth.getUser(token);
  if (!userRes?.user) return { error: "Invalid token", status: 401 as const };
  const { data: prof } = await sb.from("profiles").select("team_id, role").eq("id", userRes.user.id).maybeSingle();
  const p = (prof ?? {}) as { team_id?: string | null; role?: string };
  if (!["COACH", "ADMIN", "STAFF"].includes(String(p.role ?? "").toUpperCase())) return { error: "Coach role required", status: 403 as const };
  if (!p.team_id) return { error: "No team", status: 400 as const };
  return { sb, teamId: p.team_id };
}

export async function GET(req: NextRequest) {
  const ctx = await requireCoach(req);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { sb, teamId } = ctx;

  const { data: teamRow } = await sb.from("teams").select("gps_provider").eq("id", teamId).maybeSingle();
  const isKinexon = String((teamRow as { gps_provider?: string | null } | null)?.gps_provider ?? "").toLowerCase() === "kinexon";
  if (!isKinexon) return NextResponse.json({ isKinexon: false, players: [] });

  const iso = (daysBack: number) => new Date(Date.now() - daysBack * 86_400_000).toISOString().slice(0, 10);
  const since = iso(28), matchSince = iso(MATCH_WINDOW_DAYS);
  const [{ data: players }, { data: fixtures }] = await Promise.all([
    sb.from("players").select("id, full_name").eq("team_id", teamId).eq("is_active", true),
    sb.from("match_schedule").select("match_date").eq("team_id", teamId).gte("match_date", matchSince).lte("match_date", iso(0)),
  ]);
  const nameById = new Map(((players ?? []) as Array<{ id: string; full_name: string | null }>).map((p) => [p.id, p.full_name ?? "—"]));
  const matchDates = new Set(((fixtures ?? []) as Array<{ match_date: string }>).map((f) => f.match_date));

  // Recent Kinexon rows, plus the older match days — raw_payload_json read here (server), only compact
  // means go back. The match days are fetched by date so a long window never hits the 1000-row cap.
  const COLS = "player_id, date, total_player_load, total_distance, velocity_band5_total_distance, velocity_band6_total_distance, session_duration_minutes, ima_cod, raw_payload_json";
  const olderMatchDates = [...matchDates].filter((d) => d < since);
  const [{ data: recentRows }, { data: matchRows }] = await Promise.all([
    sb.from("player_external_load_daily").select(COLS).eq("team_id", teamId).eq("source", "kinexon").gte("date", since).limit(1000),
    olderMatchDates.length
      ? sb.from("player_external_load_daily").select(COLS).eq("team_id", teamId).eq("source", "kinexon").in("date", olderMatchDates).limit(1000)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);

  const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const rows: KinexonLoadRow[] = [...((recentRows ?? []) as Array<Record<string, unknown>>), ...((matchRows ?? []) as Array<Record<string, unknown>>)].flatMap((r) => {
    const pid = r.player_id as string | null;
    const date = r.date as string | null;
    if (!pid || !date) return [];
    const v5 = numOrNull(r.velocity_band5_total_distance), v6 = numOrNull(r.velocity_band6_total_distance);
    return [{
      playerId: pid, date,
      pl: numOrNull(r.total_player_load), distance: numOrNull(r.total_distance),
      hsr: v5 != null || v6 != null ? (v5 ?? 0) + (v6 ?? 0) : null,
      duration: numOrNull(r.session_duration_minutes),
      cod: readKinexonMetric(r, BY_KEY["cod"]), coo: readKinexonMetric(r, BY_KEY["coo"]),
      exertions: readKinexonMetric(r, BY_KEY["exertions"]), mechLoad: readKinexonMetric(r, BY_KEY["mech_load"]),
    }];
  });

  // The top-level numbers stay the per-session TRAINING means the PDF already reads; `match` is new.
  const out = [...aggregateKinexonWeekPlanLoad(rows, matchDates, since).entries()].map(([pid, a]) => ({
    name: nameById.get(pid) ?? "—",
    pl: a.training.pl, distance: a.training.distance, hsr: a.training.hsr, duration: a.training.duration,
    cod: a.training.cod, coo: a.training.coo, exertions: a.training.exertions, mechLoad: a.training.mechLoad,
    match: a.match,
  }));
  return NextResponse.json({ isKinexon: true, players: out });
}
