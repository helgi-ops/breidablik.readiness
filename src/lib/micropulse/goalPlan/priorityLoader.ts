import "server-only";

/**
 * Goal plan, lota 7: reads the team's numbers for the "most to gain" suggestion (`priority.ts`). Server-only and
 * read-only. One read per team: active players on the team, their GPS days in the last 12 months, the latest sprint
 * test, and CMJ jump height from the force plates in the last 12 months. Everything is filtered by the team's own
 * player ids; no other team's rows are read.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllPages } from "@/lib/supabasePaginate";
import { LOOKBACK_DAYS } from "@/lib/micropulse/nearMaxExposure";
import { aggregateTrialsByTest } from "@/lib/micropulse/vald/trialAggregate";
import { GPS_SOURCES, toSport } from "./loader";
import { blockReason } from "./common";
import { addDays } from "./today";
import {
  MAX_JUMP_AGE_DAYS,
  goalPriority,
  priorityReads,
  priorityValues,
  teamEffortMetric,
  type EffortMetric,
  type GoalPriority,
  type PriorityGpsRow,
  type PriorityPlayerRaw,
  type PriorityRead,
  type PriorityTeam,
} from "./priority";
import { GOAL_QUALITIES, type GoalQuality } from "./types";
import { positionGroup as periodGroup } from "@/lib/micropulse/periodization";

type Sb = SupabaseClient;

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

/** GPS time: the stored session length, else PlayerLoad ÷ PlayerLoad per minute. */
export function gpsMinutes(r: Record<string, unknown>): number | null {
  const dur = num(r.session_duration_minutes);
  if (dur != null && dur > 0) return dur;
  const pl = num(r.player_load), plm = num(r.player_load_per_minute);
  return pl != null && plm != null && plm > 0 ? pl / plm : null;
}

export type PlayerPriority = {
  metric: EffortMetric;
  reads: PriorityRead[];
  /** The rule's answer for each quality the player could pick. */
  byQuality: Record<GoalQuality, GoalPriority>;
};

export type TeamPriorityInput = {
  team: PriorityTeam;
  sport: ReturnType<typeof toSport>;
  roster: { id: string; position: string | null }[];
};

/** The team's numbers (one read for the whole team). Active players only. */
export async function loadTeamPriorityInput(sb: Sb, teamId: string, todayIso: string): Promise<TeamPriorityInput> {
  const [{ data: pRows, error: pErr }, { data: tRow }] = await Promise.all([
    sb.from("players").select("id, position, is_active").eq("team_id", teamId),
    sb.from("teams").select("sport").eq("id", teamId).maybeSingle(),
  ]);
  if (pErr) throw new Error(pErr.message);
  const roster = ((pRows ?? []) as { id: string; position: string | null; is_active: boolean | null }[]).filter((p) => p.is_active !== false);
  const sportRaw = (tRow as { sport: string | null } | null)?.sport ?? null;
  const sport = toSport(sportRaw);
  const ids = roster.map((p) => p.id);
  const from = addDays(todayIso, -LOOKBACK_DAYS);
  const jumpFrom = addDays(todayIso, -MAX_JUMP_AGE_DAYS);

  const [gps, sprint, cmj] = await Promise.all([
    fetchAllPages<Record<string, unknown>>((a, b) =>
      sb.from("player_external_load_daily")
        .select("player_id, date, source, max_velocity, max_vel, player_load, total_distance, session_duration_minutes, player_load_per_minute, ima_band3_accel_count, ima_band3_decel_count, max_acceleration, max_deceleration")
        .in("player_id", ids).in("source", GPS_SOURCES).gte("date", from).lte("date", todayIso)
        .order("player_id", { ascending: true }).order("date", { ascending: true }).order("source", { ascending: true }).range(a, b)),
    sb.from("player_fitness_test").select("player_id, result_value, test_date").in("player_id", ids).eq("test_type", "sprint_max")
      .order("test_date", { ascending: false }).limit(500),
    fetchAllPages<Record<string, unknown>>((a, b) =>
      sb.from("vald_forcedecks_results")
        .select("microplayer_id, raw_test_id, test_timestamp, jump_height_cm, is_valid")
        .in("microplayer_id", ids).eq("test_type", "CMJ")
        .gte("test_timestamp", `${jumpFrom}T00:00:00Z`).lte("test_timestamp", `${todayIso}T23:59:59Z`)
        .not("jump_height_cm", "is", null)
        .order("microplayer_id", { ascending: true }).order("test_timestamp", { ascending: true }).range(a, b)),
  ]);

  const gpsBy = new Map<string, PriorityGpsRow[]>();
  for (const r of gps) {
    const pid = String(r.player_id);
    const row: PriorityGpsRow = {
      date: String(r.date ?? "").slice(0, 10),
      maxVelocity: num(r.max_velocity), maxVel: num(r.max_vel),
      playerLoad: num(r.player_load), totalDistance: num(r.total_distance),
      minutes: gpsMinutes(r),
      accelB3: num(r.ima_band3_accel_count), decelB3: num(r.ima_band3_decel_count),
      accelPeak: num(r.max_acceleration), decelPeak: num(r.max_deceleration),
    };
    (gpsBy.get(pid) ?? gpsBy.set(pid, []).get(pid)!).push(row);
  }
  // Latest sprint test per player (the plan's top-speed read does the same).
  const sprintBy = new Map<string, number>();
  for (const r of ((sprint.data ?? []) as { player_id: string; result_value: unknown }[])) {
    if (sprintBy.has(r.player_id)) continue;
    const v = num(r.result_value);
    if (v != null && v > 0) sprintBy.set(r.player_id, v);
  }
  const trialsBy = new Map<string, { rawTestId: string | null; testTimestamp: string; metrics: Record<string, number | null> }[]>();
  for (const r of cmj) {
    if (r.is_valid === false) continue;
    const pid = String(r.microplayer_id);
    (trialsBy.get(pid) ?? trialsBy.set(pid, []).get(pid)!).push({
      rawTestId: (r.raw_test_id as string | null) ?? null,
      testTimestamp: String(r.test_timestamp),
      metrics: { jump_height_cm: num(r.jump_height_cm) },
    });
  }

  const raw: PriorityPlayerRaw[] = roster.map((p) => ({
    playerId: p.id,
    position: p.position,
    gps: gpsBy.get(p.id) ?? [],
    sprintTestKmh: sprintBy.get(p.id) ?? null,
    jumps: aggregateTrialsByTest(trialsBy.get(p.id) ?? [], ["jump_height_cm"])
      .map((t) => ({ date: t.testTimestamp.slice(0, 10), cm: t.metrics.jump_height_cm ?? NaN, trials: t.trialCount }))
      .filter((t) => Number.isFinite(t.cm) && t.cm > 0),
  }));
  const metric = teamEffortMetric(raw);
  return {
    team: { sport: sportRaw, metric, players: raw.map((p) => ({ playerId: p.playerId, position: p.position, values: priorityValues(p, todayIso, metric) })) },
    sport,
    roster: roster.map((p) => ({ id: p.id, position: p.position })),
  };
}

/** The rule's answer for one player from the team's numbers. null when the player is not active on the team. */
export function playerPriorityFrom(input: TeamPriorityInput, playerId: string, todayIso: string): PlayerPriority | null {
  const me = input.roster.find((p) => p.id === playerId);
  if (!me) return null;
  const { team, sport } = input;
  const metric = team.metric;
  const isGoalkeeper = periodGroup(me.position).key === 0;
  const blocked = Object.fromEntries(GOAL_QUALITIES.map((quality) => [quality, blockReason({
    quality, todayIso, sport, isGoalkeeper, isActive: true, ageYears: null, unavailable: false, inSeason: true,
    topSpeed: null, sprintTimes: null, cmj: null, strength: null, braking: null, weakerLeg: null,
  }) != null])) as Record<GoalQuality, boolean>;

  const reads = priorityReads(team, playerId, blocked);
  if (!reads) return null;
  const byQuality = Object.fromEntries(GOAL_QUALITIES.map((q) => [q, goalPriority(reads, q, metric)])) as Record<GoalQuality, GoalPriority>;
  return { metric, reads, byQuality };
}

/** The player's read against their team. null when the player is not an active player on the team. */
export async function loadPlayerPriority(sb: Sb, teamId: string, playerId: string, todayIso: string): Promise<PlayerPriority | null> {
  return playerPriorityFrom(await loadTeamPriorityInput(sb, teamId, todayIso), playerId, todayIso);
}
