import "server-only";

/**
 * Goal plan loader: reads one player's own data once and builds the `GoalPlanInput` for all four qualities.
 * Server-only, read-only. It never reads the readiness colour as an input and never writes anything.
 *
 * Sources (each one optional; a missing source is listed on the card as "missing", never guessed):
 *   - players / teams: age (date of birth → whole years, never logged), position (goalkeeper), sport, gender.
 *   - Top speed: the same GPS rows, reference (3rd-fastest day in 12 months, or a faster sprint test) and 90% rule
 *     as the "Top speed due" chip, WITHOUT its "GPS day in the last 10 days" gate: off-season a player still has a
 *     top speed, the gap is just long (→ build-up weeks first).
 *   - Tests older than 12 months (VALD jump / strength, sprint times) are not used to pick the start (MicroPulse
 *     rule): the card then lists them as missing.
 *   - VALD (via the RTP assessment read): CMJ height + RSI-mod, IMTP relative force, single-leg tests.
 *   - DSI: squad-relative only. An absolute DSI tier reads the whole squad as "max strength" (stored CMJ force is a
 *     gross peak), so the tier is passed on only when the squad has enough tests to rank against.
 *   - Sprint times: latest physical assessment with a 5/10/20 m time.
 *   - Braking: McBurnie hard-braking status (28 d vs own usual) + high-speed cutting L/R over 14 days.
 *   - Injury: `player_injuries` (injured / rehab / return-to-train) or the RTT read says currently injured.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { ageYears } from "@/lib/legal/age";
import { positionGroup } from "@/lib/micropulse/periodization";
import { fetchAllPages } from "@/lib/supabasePaginate";
import { DUE_DAYS, HIGH_CONF_REF_DAYS, LONG_GAP_DAYS, LOOKBACK_DAYS, NEAR_MAX_PCT, mergeSpeedDays, referenceTopSpeed, type SpeedRow } from "@/lib/micropulse/nearMaxExposure";
import { buildRtpAssessment } from "@/lib/micropulse/rtp/buildRtpAssessment";
import type { RtpAssessment } from "@/lib/micropulse/rtp/types";
import { classifyValdMetric, type PopKey } from "@/lib/micropulse/vald/benchmarks";
import { loadDsiForTeam, squadThresholdsFromMap } from "@/lib/micropulse/strengthProgramming/loadDsiForTeam";
import { deriveDsiForPlayer } from "@/lib/micropulse/strengthProgramming/deriveDsi";
import { asymPct, favoredSide } from "@/lib/micropulse/codAsymmetry";
import { buildGoalPlan } from "./index";
import { blockReason } from "./common";
import type { GoalBlockReason, GoalPlan, GoalPlanInput, GoalQuality, GoalSport, StrengthBand } from "./types";
import { GOAL_QUALITIES } from "./types";

const UNAVAILABLE_STATUS = ["injured", "rehabilitation", "rtp_training"];
/** Single-leg VALD tests whose L/R gap can name a weaker leg (Bishop 2018: ≥10% worth acting on). */
const SINGLE_LEG_TESTS = ["SLJ", "SLDJ", "SLISOSQT", "SLCMJ", "SLCMRJ", "SLHJ"];
const WEAKER_LEG_PCT = 10;
const COD_WINDOW_DAYS = 14;
/** GPS feeds that carry a real top speed (same list as the "Top speed due" chip). */
const GPS_SOURCES = ["catapult", "manual", "titan", "kinexon", "wimu"];
/** A test older than this does not pick the start (MicroPulse rule). */
const MAX_TEST_AGE_DAYS = 365;

type Sb = SupabaseClient;

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

function toSport(raw: string | null | undefined): GoalSport {
  const s = String(raw ?? "").trim().toLowerCase();
  if (s === "football" || s === "soccer") return "football";
  if (s === "basketball") return "basketball";
  return "other";
}

function band(key: string, value: number | null | undefined, pop: PopKey): StrengthBand | null {
  const b = classifyValdMetric(key, value ?? null, pop)?.band;
  return b === "elite" || b === "good" || b === "average" || b === "below" ? b : null;
}

function daysAgoIso(todayIso: string, days: number): string {
  const d = new Date(`${todayIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

async function safe<T>(p: PromiseLike<T> | Promise<T>, fallback: T): Promise<T> {
  try { return await p; } catch { return fallback; }
}

/** Latest single-leg test with a ≥10% gap: the lower side is the weaker leg. */
export function weakerLegFromBattery(rtp: RtpAssessment | null): GoalPlanInput["weakerLeg"] {
  if (!rtp) return null;
  const tests = rtp.battery
    .filter((t) => SINGLE_LEG_TESTS.includes(t.testType.toUpperCase()) && t.left != null && t.right != null && t.left > 0 && t.right > 0)
    .sort((a, b) => String(b.testDate ?? "").localeCompare(String(a.testDate ?? "")));
  const t = tests[0];
  if (!t) return null;
  const pct = asymPct(t.left!, t.right!);
  if (pct == null || pct < WEAKER_LEG_PCT) return null;
  return { side: t.left! < t.right! ? "left" : "right", asymPct: pct, test: t.label, date: t.testDate };
}

const daysBetween = (fromIso: string, toIso: string) =>
  Math.round((Date.parse(`${toIso.slice(0, 10)}T00:00:00Z`) - Date.parse(`${fromIso.slice(0, 10)}T00:00:00Z`)) / 86_400_000);

/** True when the test date is known and within 12 months. */
export function freshTest(date: string | null | undefined, todayIso: string): boolean {
  if (!date) return false;
  const d = daysBetween(date, todayIso);
  return Number.isFinite(d) && d >= 0 && d <= MAX_TEST_AGE_DAYS;
}

/** Top speed + days since a run at 90% of it, with no "recent GPS day" gate (see header). */
export function topSpeedRead(rows: SpeedRow[], todayIso: string, sprintTestKmh: number | null): GoalPlanInput["topSpeed"] {
  const days = mergeSpeedDays(rows).filter((d) => d.date <= todayIso && daysBetween(d.date, todayIso) <= LOOKBACK_DAYS);
  const ref = referenceTopSpeed(days, todayIso, sprintTestKmh);
  if (!ref) return null;
  const target = ref.kmh * NEAR_MAX_PCT;
  let last: string | null = null;
  for (const d of days) if (d.kmh >= target - 1e-9 && (!last || d.date > last)) last = d.date;
  const daysSince = last ? daysBetween(last, todayIso) : null;
  return {
    level: daysSince == null || daysSince > LONG_GAP_DAYS ? "long_gap" : daysSince > DUE_DAYS ? "due" : "ok",
    daysSince,
    refKmh: ref.kmh,
    targetKmh: Math.round(target * 10) / 10,
    confidence: ref.source === "sprint_test" || ref.days >= HIGH_CONF_REF_DAYS ? "high" : "moderate",
  };
}

export type GoalPlanPreview = {
  playerId: string;
  name: string | null;
  todayIso: string;
  plans: GoalPlan[];
};

export type GoalPlanBase = { playerId: string; name: string | null; base: Omit<GoalPlanInput, "quality"> };

/** Everything the engine reads about one player (all four qualities share it). Read-only. */
export async function loadGoalPlanBase(sb: Sb, teamId: string, playerId: string, todayIso: string): Promise<GoalPlanBase> {
  const [{ data: pRow }, { data: tRow }] = await Promise.all([
    sb.from("players").select("id, full_name, position, is_active, date_of_birth").eq("id", playerId).eq("team_id", teamId).maybeSingle(),
    sb.from("teams").select("sport, gender").eq("id", teamId).maybeSingle(),
  ]);
  const player = pRow as { id: string; full_name: string | null; position: string | null; is_active: boolean | null; date_of_birth: string | null } | null;
  if (!player) throw new Error("Player not on this team");
  const team = tRow as { sport: string | null; gender: string | null } | null;
  const sport = toSport(team?.sport);
  const age = ageYears(player.date_of_birth, new Date(`${todayIso}T12:00:00Z`));

  const codFrom = daysAgoIso(todayIso, COD_WINDOW_DAYS);
  const gpsFrom = daysAgoIso(todayIso, LOOKBACK_DAYS);
  const [gpsRows, sprintTest, rtp, dsiMap, injuries, decel, codRows, assessments] = await Promise.all([
    safe(fetchAllPages<Record<string, unknown>>((a, b) =>
      sb.from("player_external_load_daily")
        .select("date, max_velocity, max_vel, player_load, total_distance")
        .eq("player_id", playerId).in("source", GPS_SOURCES)
        .gte("date", gpsFrom).lte("date", todayIso)
        .order("date", { ascending: true }).range(a, b)), [] as Record<string, unknown>[]),
    safe(sb.from("player_fitness_test").select("result_value").eq("player_id", playerId).eq("test_type", "sprint_max")
      .order("test_date", { ascending: false }).limit(1), { data: null, error: null } as never),
    safe(buildRtpAssessment(sb, playerId, teamId), null as RtpAssessment | null),
    safe(loadDsiForTeam(sb, teamId), new Map()),
    safe(sb.from("player_injuries").select("status").eq("player_id", playerId).in("status", UNAVAILABLE_STATUS).limit(1), { data: null, error: null } as never),
    safe(sb.rpc("get_mcburnie_decel_status", { p_player_id: playerId }), { data: null, error: null } as never),
    safe(sb.from("player_external_load_daily").select("ima_cod_left_high, ima_cod_right_high")
      .eq("player_id", playerId).gte("date", codFrom).lte("date", todayIso).limit(200), { data: null, error: null } as never),
    safe(sb.from("physical_assessments").select("id, assessment_date").eq("player_id", playerId)
      .order("assessment_date", { ascending: false }).limit(10), { data: null, error: null } as never),
  ]);

  // ── Strength (VALD) ──
  const pop: PopKey = rtp?.benchmarkPop ?? "other";
  const imtpRel = freshTest(rtp?.imtp?.testDate, todayIso) ? rtp?.imtp?.relPeakForceNkg ?? null : null;
  const dsiRead = dsiMap.has(playerId) ? deriveDsiForPlayer(dsiMap.get(playerId)!, squadThresholdsFromMap(dsiMap)) : null;
  const rawTier = dsiRead?.basis === "squad" ? dsiRead.dsi?.tier ?? null : null;
  const dsiTier = rawTier === "ballistic" || rawTier === "concurrent" || rawTier === "max_strength" ? rawTier : null;
  const strength: GoalPlanInput["strength"] = imtpRel != null || dsiTier
    ? { imtpRelNkg: imtpRel, imtpBand: band("imtpRelForceNkg", imtpRel, pop), dsiTier, dsiBasis: dsiTier ? "squad" : null, date: rtp?.imtp?.testDate ?? null }
    : null;

  const cmj: GoalPlanInput["cmj"] = rtp?.cmj && freshTest(rtp.cmj.testDate, todayIso) && (rtp.cmj.jumpHeightCm != null || rtp.cmj.rsiMod != null)
    ? {
        heightCm: rtp.cmj.jumpHeightCm,
        rsiMod: rtp.cmj.rsiMod,
        date: rtp.cmj.testDate,
        heightBand: band("cmjJumpHeightCm", rtp.cmj.jumpHeightCm, pop),
        rsiBand: band("cmjRsiMod", rtp.cmj.rsiMod, pop),
      }
    : null;

  // ── Sprint times: the latest assessment that has any of 5 / 10 / 20 m ──
  let sprintTimes: GoalPlanInput["sprintTimes"] = null;
  const aRows = ((assessments as { data: Array<{ id: string; assessment_date: string }> | null }).data ?? []);
  if (aRows.length) {
    const { data: mRows } = await safe(
      sb.from("physical_assessment_metrics").select("assessment_id, metric_code, value")
        .in("assessment_id", aRows.map((a) => a.id)).in("metric_code", ["sprint_5m_s", "sprint_10m_s", "sprint_20m_s"]),
      { data: null, error: null } as never,
    ) as { data: Array<{ assessment_id: string; metric_code: string; value: number | string | null }> | null };
    for (const a of aRows) {
      const m = (mRows ?? []).filter((r) => r.assessment_id === a.id);
      const get = (c: string) => { const v = num(m.find((r) => r.metric_code === c)?.value); return v != null && v > 0 ? v : null; };
      const s5 = get("sprint_5m_s"), s10 = get("sprint_10m_s"), s20 = get("sprint_20m_s");
      if (!freshTest(a.assessment_date, todayIso)) break; // newest first: the rest are older still
      if (s5 != null || s10 != null || s20 != null) { sprintTimes = { s5, s10, s20, date: String(a.assessment_date).slice(0, 10) }; break; }
    }
  }

  // ── Braking ──
  const overload = ((decel as { data: { overload?: { flag?: string } } | null }).data?.overload?.flag ?? null) as string | null;
  const overloadFlag = overload === "green" || overload === "yellow" || overload === "red" || overload === "unknown" ? overload : null;
  let codL = 0, codR = 0;
  for (const r of ((codRows as { data: Array<Record<string, unknown>> | null }).data ?? [])) {
    codL += num(r.ima_cod_left_high) ?? 0;
    codR += num(r.ima_cod_right_high) ?? 0;
  }
  const codPct = codL + codR > 0 ? asymPct(codL, codR) : null;
  const braking: GoalPlanInput["braking"] = overloadFlag || codPct != null
    ? { overloadFlag, codAsymHighPct: codPct, codLean: codL + codR > 0 ? favoredSide(codL, codR) : null }
    : null;

  // ── Availability ──
  const injured = (((injuries as { data: unknown[] | null }).data ?? []).length > 0) || rtp?.rtt?.currentlyInjured === true;

  const speedRows: SpeedRow[] = gpsRows.map((r) => ({
    date: String(r.date ?? "").slice(0, 10),
    maxVelocity: num(r.max_velocity), maxVel: num(r.max_vel),
    playerLoad: num(r.player_load), totalDistance: num(r.total_distance),
  }));
  const testKmh = num(((sprintTest as { data: Array<{ result_value: unknown }> | null }).data ?? [])[0]?.result_value);
  const topSpeed = topSpeedRead(speedRows, todayIso, testKmh != null && testKmh > 0 ? testKmh : null);

  const base: Omit<GoalPlanInput, "quality"> = {
    todayIso,
    sport,
    isGoalkeeper: positionGroup(player.position).key === 0,
    isActive: player.is_active !== false,
    ageYears: age,
    unavailable: injured,
    inSeason: true,
    topSpeed,
    sprintTimes,
    cmj,
    strength,
    braking,
    weakerLeg: weakerLegFromBattery(rtp),
  };

  return { playerId, name: player.full_name, base };
}

export async function loadGoalPlanPreview(sb: Sb, teamId: string, playerId: string, todayIso: string): Promise<GoalPlanPreview> {
  const { name, base } = await loadGoalPlanBase(sb, teamId, playerId, todayIso);
  return {
    playerId,
    name,
    todayIso,
    plans: GOAL_QUALITIES.map((quality) => buildGoalPlan({ ...base, quality })),
  };
}

/**
 * Light read for the player's request screen: which qualities can be asked for now. Reads only the player row,
 * the team's sport and open injuries, so opening the screen stays cheap. The full engine read runs again when
 * the request is sent (it also catches a return-to-train plan this light read does not see).
 */
export async function loadGoalEligibility(sb: Sb, teamId: string, playerId: string): Promise<{ quality: GoalQuality; blocked: GoalBlockReason | null }[]> {
  const [{ data: pRow }, { data: tRow }, { data: inj }] = await Promise.all([
    sb.from("players").select("position, is_active").eq("id", playerId).eq("team_id", teamId).maybeSingle(),
    sb.from("teams").select("sport").eq("id", teamId).maybeSingle(),
    sb.from("player_injuries").select("status").eq("player_id", playerId).in("status", UNAVAILABLE_STATUS).limit(1),
  ]);
  const player = pRow as { position: string | null; is_active: boolean | null } | null;
  if (!player) throw new Error("Player not on this team");
  const sport = toSport((tRow as { sport: string | null } | null)?.sport);
  const unavailable = ((inj as unknown[] | null) ?? []).length > 0;
  return GOAL_QUALITIES.map((quality) => ({
    quality,
    blocked: blockReason({
      quality, todayIso: "", sport, isGoalkeeper: positionGroup(player.position).key === 0,
      isActive: player.is_active !== false, ageYears: null, unavailable, inSeason: true,
      topSpeed: null, sprintTimes: null, cmj: null, strength: null, braking: null, weakerLeg: null,
    }),
  }));
}
