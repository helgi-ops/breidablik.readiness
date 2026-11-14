import "server-only";

/**
 * Goal plan, lota 4: server reads for progress and outcome. Read-only (ticks and coach results are written by
 * `store.ts`).
 *   - Ticks and coach results: the goal tables.
 *   - Jump height: VALD force plates, CMJ, the mean of each test's valid trials (Claudino 2017), in the window around
 *     the start (4 weeks before to week 1) and around the end (week 7 to 2 weeks after). Copied nowhere.
 *   - GPS context, per day: top speed (the same validity filter as the top-speed signal); braking / acceleration as
 *     the count of top-band efforts (IMA Dec / Acc band 3) when the player has it, otherwise the peak in m/s².
 *   - The team calendar over the plan, to count the sessions the rules placed (adherence).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllPages } from "@/lib/supabasePaginate";
import { mergeSpeedDays } from "@/lib/micropulse/nearMaxExposure";
import { aggregateTrialsByTest } from "@/lib/micropulse/vald/trialAggregate";
import { GPS_SOURCES } from "./loader";
import { goalResults, goalSessionMarks, playerGoalHistoryRows } from "./store";
import { HISTORY_MAX, buildGoalHistoryItem, isHistoryRow, type GoalHistoryItem } from "./history";
import { addDays, placedSessionsUpTo, toTeamDayType, type TeamCalendar } from "./today";
import { adherence, effortDays, goalOutcome, gpsContext, type GoalProgress, type GoalResult, type GpsDay, type GpsKind, type GpsMetric } from "./outcome";
import type { GoalPlanRow } from "./requests";

type Sb = SupabaseClient;

/** The team's training-week days and matches between two dates. */
export async function loadTeamCalendarRange(sb: Sb, teamId: string, from: string, to: string): Promise<TeamCalendar> {
  const [fixtures, plans] = await Promise.all([
    sb.from("match_schedule").select("match_date").eq("team_id", teamId).gte("match_date", from).lte("match_date", to),
    sb.from("week_plans").select("day_date, day_type").eq("team_id", teamId).gte("day_date", from).lte("day_date", to).limit(1000),
  ]);
  const games = new Set<string>();
  for (const r of (fixtures.data ?? []) as { match_date: string | null }[]) if (r.match_date) games.add(String(r.match_date).slice(0, 10));
  const days: TeamCalendar["days"] = {};
  for (const r of (plans.data ?? []) as { day_date: string; day_type: string | null }[]) {
    const t = toTeamDayType(r.day_type);
    if (!t) continue;
    const d = String(r.day_date).slice(0, 10);
    days[d] = t;
    if (t === "game") games.add(d);
  }
  return { days, games: [...games] };
}

/** VALD CMJ jump height as start / retest rows (mean of the test's trials). */
export async function valdJumpResults(sb: Sb, playerId: string, startDate: string, endDate: string, todayIso: string): Promise<GoalResult[]> {
  const from = addDays(startDate, -28);
  const to = addDays(endDate, 14) < todayIso ? addDays(endDate, 14) : todayIso;
  const { data, error } = await sb.from("vald_forcedecks_results")
    .select("raw_test_id, test_timestamp, jump_height_cm, is_valid")
    .eq("microplayer_id", playerId).eq("test_type", "CMJ")
    .gte("test_timestamp", `${from}T00:00:00Z`).lte("test_timestamp", `${to}T23:59:59Z`)
    .not("jump_height_cm", "is", null).limit(500);
  if (error) throw new Error(error.message);
  const rows = ((data ?? []) as { raw_test_id: string | null; test_timestamp: string; jump_height_cm: number | string | null; is_valid: boolean | null }[])
    .filter((r) => r.is_valid !== false)
    .map((r) => ({ rawTestId: r.raw_test_id, testTimestamp: r.test_timestamp, metrics: { jump_height_cm: r.jump_height_cm == null ? null : Number(r.jump_height_cm) } }));
  const tests = aggregateTrialsByTest(rows, ["jump_height_cm"]) // newest first
    .map((t) => ({ id: `vald:${t.rawTestId ?? t.testTimestamp}`, date: t.testTimestamp.slice(0, 10), cm: t.metrics.jump_height_cm, n: t.trialCount }))
    .filter((t): t is { id: string; date: string; cm: number; n: number } => t.cm != null && t.cm > 0);
  const out: GoalResult[] = [];
  const base = tests.find((t) => t.date >= from && t.date <= addDays(startDate, 6));
  const re = tests.find((t) => t.date >= addDays(startDate, 42) && t.date <= to);
  const row = (t: typeof tests[number], phase: GoalResult["phase"]): GoalResult => ({
    id: t.id, measure: "cmj_cm", phase, value: Math.round(t.cm * 10) / 10, test_date: t.date,
    note: `VALD, mean of ${t.n} jump${t.n === 1 ? "" : "s"}`, source: "vald",
  });
  if (base) out.push(row(base, "baseline"));
  if (re) out.push(row(re, "retest"));
  return out;
}

async function gpsDays(sb: Sb, playerId: string, kind: GpsKind, from: string, to: string): Promise<{ metric: GpsMetric; days: GpsDay[] }> {
  if (kind === "top_speed") {
    const rows = await fetchAllPages<Record<string, unknown>>((a, b) =>
      sb.from("player_external_load_daily").select("date, max_velocity, max_vel, player_load, total_distance")
        .eq("player_id", playerId).in("source", GPS_SOURCES).gte("date", from).lte("date", to).order("date", { ascending: true }).range(a, b));
    const days = mergeSpeedDays(rows.map((r) => ({
      date: String(r.date ?? "").slice(0, 10),
      maxVelocity: r.max_velocity == null ? null : Number(r.max_velocity), maxVel: r.max_vel == null ? null : Number(r.max_vel),
      playerLoad: r.player_load == null ? null : Number(r.player_load), totalDistance: r.total_distance == null ? null : Number(r.total_distance),
    }))).map((d) => ({ date: d.date, value: d.kmh }));
    return { metric: "peak", days };
  }
  // Braking / acceleration: top-band effort counts (Breiðablik, HK) or the peak in m/s² (Keflavík, Fylkir …).
  const [band3Col, peakCol] = kind === "braking"
    ? ["ima_band3_decel_count", "max_deceleration"] as const
    : ["ima_band3_accel_count", "max_acceleration"] as const;
  const rows = await fetchAllPages<Record<string, unknown>>((a, b) =>
    sb.from("player_external_load_daily").select(`date, ${band3Col}, ${peakCol}`)
      .eq("player_id", playerId).in("source", GPS_SOURCES).gte("date", from).lte("date", to).order("date", { ascending: true }).range(a, b));
  return effortDays(rows.map((r) => ({
    date: String(r.date ?? ""),
    band3: r[band3Col] == null ? null : Number(r[band3Col]),
    peak: r[peakCol] == null ? null : Number(r[peakCol]),
  })));
}

/** Progress of an approved, paused, finished or stopped plan. null before approval. */
export async function loadGoalProgress(
  sb: Sb, teamId: string, row: GoalPlanRow, todayIso: string, opts: { gps?: boolean } = {},
): Promise<GoalProgress | null> {
  if (!row.plan || !row.start_date || !row.end_date || row.plan.status !== "ok") return null;
  if (!["approved", "paused", "completed", "cancelled"].includes(row.status)) return null;
  const stopAt = row.status === "paused" ? row.paused_at?.slice(0, 10) : row.status === "cancelled" ? row.closed_at?.slice(0, 10) : null;
  const until = [todayIso, row.end_date, stopAt].filter((d): d is string => !!d).sort()[0];
  const wantGps = opts.gps !== false;
  const gpsKind: GpsKind | null = wantGps && (row.quality === "top_speed" || row.quality === "braking" || row.quality === "acceleration") ? row.quality : null;
  const noGps = { metric: "peak" as GpsMetric, days: [] as GpsDay[] };
  const [marks, coach, vald, cal, gps] = await Promise.all([
    goalSessionMarks(sb, row.id),
    goalResults(sb, row.id),
    row.quality === "jump" ? valdJumpResults(sb, row.player_id, row.start_date, row.end_date, todayIso).catch(() => [] as GoalResult[]) : Promise.resolve([] as GoalResult[]),
    loadTeamCalendarRange(sb, teamId, addDays(row.start_date, -11), addDays(until, 11)),
    gpsKind ? gpsDays(sb, row.player_id, gpsKind, addDays(row.start_date, -28), until).catch(() => noGps) : Promise.resolve(noGps),
  ]);
  const results = [...vald, ...coach].sort((a, b) => a.test_date.localeCompare(b.test_date));
  const due = until >= row.start_date ? placedSessionsUpTo(row.plan, row.quality, row.start_date, until, cal) : [];
  return {
    results,
    outcome: goalOutcome(row.quality, results),
    adherence: adherence(due, marks, todayIso),
    marks,
    gps: gpsKind ? gpsContext(gpsKind, gps.days, row.start_date, row.end_date, until, gps.metric) : null,
    until,
  };
}

/**
 * Lota 5: the player's earlier goals (finished, or stopped after approval) on their current team, newest first.
 * Same outcome and adherence as the coach's panel; no GPS on the player side.
 */
export async function loadGoalHistory(sb: Sb, teamId: string, playerId: string, todayIso: string): Promise<GoalHistoryItem[]> {
  const rows = (await playerGoalHistoryRows(sb, teamId, playerId, HISTORY_MAX)).filter(isHistoryRow);
  const items = await Promise.all(rows.map(async (row) => {
    const p = await loadGoalProgress(sb, teamId, row, todayIso, { gps: false });
    if (!p || !row.plan || !row.start_date || !row.end_date) return null;
    return buildGoalHistoryItem({
      id: row.id, quality: row.quality, status: row.status, startDate: row.start_date, endDate: row.end_date,
      closedAt: row.closed_at, coachNote: row.coach_note, outcome: p.outcome, adherence: p.adherence,
      testsWhat: row.plan.tests.what, testsChange: row.plan.tests.change,
    });
  }));
  return items.filter((x): x is GoalHistoryItem => !!x);
}
