export const runtime = "nodejs";

/**
 * GET /api/coach/load-plan/volume-intensity?date=YYYY-MM-DD
 *
 * Owen microcycle taper read: the recent week's team sessions plotted on the
 * volume–intensity plane (one point per session-date + MD day), plus the per-session
 * MD-day appropriateness flag (reuses the existing match_demand_template band).
 *
 * Team-level: each session-date is the team mean of the four Owen variables already
 * stored on player_external_load_daily. References are the rolling team mean over a
 * longer window. Descriptive load context — never the readiness colour or daily decision.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { fetchAllPages } from "@/lib/supabasePaginate";
import { scoreVolumeIntensity, readTaperShape, type SessionLoadInputs, type TaperPoint } from "@/lib/micropulse/load/volumeIntensityScore";
import { computeWeeklyTarget, getTeamLoadTargetConfig, flagSessionVsMdBand } from "@/lib/micropulse/externalLoad/loadTargets";

const REFERENCE_WINDOW_DAYS = 42; // rolling reference (≈ 6 microcycles)
const RECENT_WINDOW_DAYS = 10;    // the microcycle we plot

type Row = {
  date: string;
  total_distance: number | null; high_speed_distance: number | null;
  velocity_band5_total_distance: number | null; velocity_band6_total_distance: number | null;
  accel_b2_3_tot_effs_gen2: number | null; decel_b2_3_tot_effs_gen2: number | null;
  total_player_load: number | null; player_load_per_minute: number | null;
  session_duration_minutes: number | null;
};

const num = (v: unknown): number | null => (typeof v === "number" && isFinite(v) ? v : null);
const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Canonical MD label for a session date from the team's fixtures: distance to the next
 * match (MD-N, ≤6 days out), match day (MD), or a post-match day (MD+N, ≤2 days after). */
function mdLabelFor(date: string, matchDates: string[]): string | null {
  const d = Date.parse(`${date}T00:00:00Z`);
  let nextIn = Infinity, sincePrev = Infinity;
  for (const m of matchDates) {
    const diff = Math.round((Date.parse(`${m}T00:00:00Z`) - d) / 86400000);
    if (diff === 0) return "MD";
    if (diff > 0) nextIn = Math.min(nextIn, diff);
    else sincePrev = Math.min(sincePrev, -diff);
  }
  if (nextIn <= 6) return `MD-${nextIn}`;
  if (sincePrev <= 2) return `MD+${sincePrev}`;
  return null;
}

/** Team-mean SessionLoadInputs for one session-date from its player rows. */
function inputsForDate(rows: Row[]): SessionLoadInputs {
  const col = (pick: (r: Row) => number | null) => rows.map(pick).filter((x): x is number => x !== null);
  const td = mean(col((r) => num(r.total_distance)));
  const hi = mean(col((r) => {
    const b5 = num(r.velocity_band5_total_distance), b6 = num(r.velocity_band6_total_distance);
    return b5 !== null || b6 !== null ? (b5 ?? 0) + (b6 ?? 0) : num(r.high_speed_distance);
  }));
  const pl = mean(col((r) => num(r.total_player_load)));
  const accelDecel = mean(col((r) => {
    const a = num(r.accel_b2_3_tot_effs_gen2), d = num(r.decel_b2_3_tot_effs_gen2);
    return a !== null || d !== null ? (a ?? 0) + (d ?? 0) : null;
  }));
  const plPerMin = mean(col((r) => num(r.player_load_per_minute)));
  const dur = mean(col((r) => num(r.session_duration_minutes)));
  const distPerMin = td !== null && dur !== null && dur > 0 ? td / dur : null;
  return {
    totalDistanceM: td, hiDistanceM: hi, playerLoad: pl, accelDecelCount: accelDecel,
    playerLoadPerMin: plPerMin, distancePerMin: distPerMin, durationMin: dur,
  };
}

export async function GET(req: NextRequest) {
  const sb = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return NextResponse.json({ ok: false, error: "Missing auth" }, { status: 401 });
  const { data: userRes } = await sb.auth.getUser(token);
  if (!userRes?.user) return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 401 });
  const { data: prof } = await sb.from("profiles").select("team_id, role").eq("id", userRes.user.id).maybeSingle();
  const role = String((prof as { role?: string } | null)?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return NextResponse.json({ ok: false, error: "Coach role required" }, { status: 403 });
  const teamId = (prof as { team_id?: string | null } | null)?.team_id ?? null;
  if (!teamId) return NextResponse.json({ ok: false, error: "No team context" }, { status: 400 });

  const url = new URL(req.url);
  const refDate = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);
  const since = (() => { const d = new Date(`${refDate}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - REFERENCE_WINDOW_DAYS); return d.toISOString().slice(0, 10); })();

  const cols = "date, total_distance, high_speed_distance, velocity_band5_total_distance, velocity_band6_total_distance, accel_b2_3_tot_effs_gen2, decel_b2_3_tot_effs_gen2, total_player_load, player_load_per_minute, session_duration_minutes";
  // Fixtures cover the window (± a match either side) so a session date can see its next match.
  const fxSince = (() => { const d = new Date(`${since}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 7); return d.toISOString().slice(0, 10); })();
  const fxUntil = (() => { const d = new Date(`${refDate}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 7); return d.toISOString().slice(0, 10); })();
  const [rows, { data: fx }] = await Promise.all([
    fetchAllPages<Row>((from, to) =>
      sb.from("player_external_load_daily").select(cols).eq("team_id", teamId).gte("date", since).lte("date", refDate).range(from, to),
    ).catch(() => [] as Row[]),
    sb.from("match_schedule").select("match_date").eq("team_id", teamId).gte("match_date", fxSince).lte("match_date", fxUntil),
  ]);
  const matchDates = ((fx ?? []) as Array<{ match_date: string }>).map((m) => m.match_date);

  // Group by session-date → team-mean inputs; MD day from fixtures (md_day_label is unreliable).
  const byDate = new Map<string, Row[]>();
  for (const r of rows) { const arr = byDate.get(r.date) ?? []; arr.push(r); byDate.set(r.date, arr); }
  const dated = [...byDate.entries()]
    .map(([date, rs]) => ({ date, mdDay: mdLabelFor(date, matchDates) ?? "", inputs: inputsForDate(rs) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Rolling reference = mean session magnitude across the whole window (PlayerLoad anchor,
  // distance fallback; per-min for intensity), so it matches the lib's anchor priority.
  const volMags = dated.map((d) => d.inputs.playerLoad ?? d.inputs.totalDistanceM).filter((x): x is number => typeof x === "number");
  const intMags = dated.map((d) => d.inputs.playerLoadPerMin ?? d.inputs.distancePerMin).filter((x): x is number => typeof x === "number");
  const reference = volMags.length && intMags.length ? { volumeRef: mean(volMags)!, intensityRef: mean(intMags)! } : null;

  // MD-day band inputs (Part 2) — reuse the existing template + match-demand average.
  let matchAvgPl: number | null = null, matchAvgTd: number | null = null, meso = 1;
  let template: Record<string, Partial<Record<string, number>>> = {};
  try {
    const [target, cfg] = await Promise.all([computeWeeklyTarget({ teamId, referenceDate: refDate }), getTeamLoadTargetConfig(teamId)]);
    matchAvgPl = num(target.match_demand_avg?.totalPlayerLoad) ?? null;
    matchAvgTd = num(target.match_demand_avg?.totalDistance) ?? null;
    meso = Number(target.mesocycle_multiplier || 1);
    template = cfg.match_demand_template as Record<string, Partial<Record<string, number>>>;
  } catch { /* band optional — the plane still renders without the flag */ }

  const recentSince = (() => { const d = new Date(`${refDate}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - RECENT_WINDOW_DAYS); return d.toISOString().slice(0, 10); })();
  type OutPoint = TaperPoint & { flag: ReturnType<typeof flagSessionVsMdBand> };
  const points: OutPoint[] = dated
    .filter((d) => d.date >= recentSince && d.mdDay && d.mdDay !== "MD")
    .map((d) => {
      const row = template[d.mdDay] ?? {};
      // Flag on PlayerLoad (fallback to distance) — the volume KPI.
      const flag = matchAvgPl !== null
        ? flagSessionVsMdBand(d.inputs.playerLoad, matchAvgPl, num(row.totalPlayerLoad), meso)
        : flagSessionVsMdBand(d.inputs.totalDistanceM, matchAvgTd, num(row.totalDistance), meso);
      const score = scoreVolumeIntensity(d.inputs, reference, d.mdDay);
      return { mdDay: d.mdDay, date: d.date, score: { ...score, vsMdExpectation: flag.band }, flag };
    });

  const taper = readTaperShape(points);
  return NextResponse.json({ ok: true, asOf: refDate, reference, points, taper });
}
