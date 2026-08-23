/**
 * Transfer-report data loading — the SINGLE source of truth for the dossier.
 *
 * `loadTransferRawInput` returns the normalised `RawDossierInput` consumed by the PDF/JSON
 * (`buildTransferDossier`), the Excel workbook, and the per-session ZIP — so all three read the
 * exact same rows and can never drift. `loadDrillRows` adds the drill-level rows the PDF doesn't
 * use (only the per-session ZIP needs them). Server-only (Node). Read-only, descriptive — it
 * never touches the readiness colour, the load target, or the daily decision.
 */

import { NextRequest } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { fetchAllPages } from "@/lib/supabasePaginate";
import { oneRowPerDate } from "@/lib/micropulse/load/oneRowPerDate";
import { buildRtpAssessment } from "@/lib/micropulse/rtp/buildRtpAssessment";
import { loadRoster, loadAthleteSignals, athleteSquadInput } from "@/lib/micropulse/playerAnalysis/loadAthleteProfilesForTeam";
import { buildAthleteProfile } from "@/lib/micropulse/playerAnalysis/athleteProfile";
import type { RawDossierInput, LoadDaily, VbtSet, MatchRow, FitnessRow, PeakPeriodRow } from "@/lib/micropulse/transferReport";

/** Transliterate Icelandic/accented text to an ASCII-safe token for filenames (Þ→Th, ð→d, á→a…). */
export function asciiSlug(s: string): string {
  const map: Record<string, string> = { "ð": "d", "Ð": "D", "þ": "th", "Þ": "Th", "æ": "ae", "Æ": "Ae", "ö": "o", "Ö": "O", "ø": "o", "Ø": "O" };
  const pre = (s || "").replace(/[ðÐþÞæÆöÖøØ]/g, (c) => map[c] ?? c);
  return pre.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
}

export type Auth = { teamId: string } | { error: string; status: number };

export async function authCoach(req: NextRequest): Promise<Auth> {
  const sb = getSupabase();
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return { error: "Missing auth", status: 401 };
  const { data: userRes } = await sb.auth.getUser(token);
  if (!userRes?.user) return { error: "Invalid token", status: 401 };
  const { data: prof } = await sb.from("profiles").select("team_id, role").eq("id", userRes.user.id).maybeSingle();
  const role = String(prof?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Coach role required", status: 403 };
  const teamId = prof?.team_id as string | null;
  if (!teamId) return { error: "No team", status: 400 };
  return { teamId };
}

export function windowDaysFrom(req: NextRequest): number {
  const raw = Number(new URL(req.url).searchParams.get("days"));
  if (!Number.isFinite(raw)) return 120;
  return Math.max(30, Math.min(365, Math.round(raw)));
}

export async function consentOk(playerId: string): Promise<boolean> {
  const sb = getSupabase();
  const { data } = await sb.from("player_consents").select("id, revoked_at").eq("player_id", playerId).ilike("consent_type", "%data_processing%").is("revoked_at", null).limit(1);
  return (data?.length ?? 0) > 0;
}

type LoadRow = {
  date: string; source: string | null; session_duration_minutes: number | null;
  total_distance: number | null; high_speed_distance: number | null; hir_dist: number | null;
  sprint_distance: number | null; velocity_band6_total_distance: number | null; max_velocity: number | null;
  total_player_load: number | null; player_load_per_minute: number | null; metabolic_power_peak: number | null;
  ima_accel: number | null; accelerations: number | null; ima_decel: number | null; decelerations: number | null;
  ima_cod: number | null; cod_events: number | null; accel_b2_3_tot_effs_gen2: number | null; decel_b2_3_tot_effs_gen2: number | null;
  ima_cod_left_low: number | null; ima_cod_left_medium: number | null; ima_cod_left_high: number | null;
  ima_cod_right_low: number | null; ima_cod_right_medium: number | null; ima_cod_right_high: number | null;
  ima_fr_band1_stride_count: number | null; ima_fr_band2_stride_count: number | null; ima_fr_band3_stride_count: number | null;
  ima_fr_band4_stride_count: number | null; ima_fr_band5_stride_count: number | null; ima_fr_band6_stride_count: number | null;
  ima_fr_band7_stride_count: number | null; ima_fr_band8_stride_count: number | null;
  ima_clock_gen2: Record<string, { low?: number; medium?: number; high?: number }> | null;
};

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const coalesce = (...xs: Array<number | null>): number | null => xs.find((x) => x != null) ?? null;

/** CoD count: aggregate ima_cod/cod_events is null on Catapult's OpenField side; sum the 12 directional cols. */
function codOf(r: LoadRow): number | null {
  const agg = coalesce(num(r.ima_cod), num(r.cod_events));
  if (agg != null) return agg;
  const dir = [r.ima_cod_left_low, r.ima_cod_left_medium, r.ima_cod_left_high, r.ima_cod_right_low, r.ima_cod_right_medium, r.ima_cod_right_high].map(num).filter((x): x is number => x != null);
  return dir.length ? dir.reduce((a, b) => a + b, 0) : null;
}

function strideSum(r: LoadRow): number | null {
  const bands = [r.ima_fr_band1_stride_count, r.ima_fr_band2_stride_count, r.ima_fr_band3_stride_count, r.ima_fr_band4_stride_count, r.ima_fr_band5_stride_count, r.ima_fr_band6_stride_count, r.ima_fr_band7_stride_count, r.ima_fr_band8_stride_count].map(num).filter((x): x is number => x != null);
  return bands.length ? bands.reduce((a, b) => a + b, 0) : null;
}

function clockHigh(grid: LoadRow["ima_clock_gen2"]): Record<string, number> | null {
  if (!grid || typeof grid !== "object") return null;
  const out: Record<string, number> = {};
  let any = false;
  for (const [dir, cell] of Object.entries(grid)) {
    const h = Number(cell?.high);
    if (Number.isFinite(h) && h > 0) { out[dir] = h; any = true; }
  }
  return any ? out : null;
}

/** Load everything for the player over the window and assemble the raw dossier input. */
export async function loadTransferRawInput(teamId: string, playerId: string, days: number): Promise<RawDossierInput | { error: string; status: number }> {
  const sb = getSupabase();
  const end = new Date().toISOString().slice(0, 10);
  const start = new Date(Date.parse(end + "T00:00:00Z") - days * 86_400_000).toISOString().slice(0, 10);

  const { data: player } = await sb.from("players").select("id, full_name, position, sport, date_of_birth").eq("id", playerId).eq("team_id", teamId).maybeSingle();
  if (!player) return { error: "Player not on your team", status: 403 };
  const p = player as { id: string; full_name: string | null; position: string | null; sport: string | null; date_of_birth: string | null };

  const { data: body } = await sb.from("player_body_metrics").select("mass_kg, height_cm, measured_on").eq("player_id", playerId).order("measured_on", { ascending: false }).limit(1).maybeSingle();

  const { data: minutesRows } = await sb.from("match_player_minutes").select("match_date, minutes_played, is_dnp").eq("player_id", playerId).gte("match_date", start).lte("match_date", end);
  const { data: statRows } = await sb.from("player_match_stats").select("match_date, opponent, minutes, goals, assists, xg").eq("player_id", playerId).gte("match_date", start).lte("match_date", end);
  const matchDateSet = new Set<string>([...(minutesRows ?? []).filter((m) => !m.is_dnp).map((m) => String(m.match_date)), ...(statRows ?? []).map((m) => String(m.match_date))]);
  const minutesByDate = new Map<string, number | null>((minutesRows ?? []).map((m) => [String(m.match_date), num(m.minutes_played)]));
  const matches: MatchRow[] = [...matchDateSet].map((d) => {
    const st = (statRows ?? []).find((s) => String(s.match_date) === d);
    return { date: d, opponent: st?.opponent ?? null, minutes: coalesce(num(st?.minutes), minutesByDate.get(d) ?? null), goals: num(st?.goals), assists: num(st?.assists), xg: num(st?.xg) };
  });

  const rawLoad = await fetchAllPages<LoadRow>((from, to) => sb
    .from("player_external_load_daily")
    .select("date, source, session_duration_minutes, total_distance, high_speed_distance, hir_dist, sprint_distance, velocity_band6_total_distance, max_velocity, total_player_load, player_load_per_minute, metabolic_power_peak, ima_accel, accelerations, ima_decel, decelerations, ima_cod, cod_events, ima_cod_left_low, ima_cod_left_medium, ima_cod_left_high, ima_cod_right_low, ima_cod_right_medium, ima_cod_right_high, accel_b2_3_tot_effs_gen2, decel_b2_3_tot_effs_gen2, ima_fr_band1_stride_count, ima_fr_band2_stride_count, ima_fr_band3_stride_count, ima_fr_band4_stride_count, ima_fr_band5_stride_count, ima_fr_band6_stride_count, ima_fr_band7_stride_count, ima_fr_band8_stride_count, ima_clock_gen2")
    .eq("player_id", playerId)
    .in("source", ["catapult", "manual"])
    .gte("date", start)
    .lte("date", end)
    .range(from, to));
  const load: LoadDaily[] = oneRowPerDate(rawLoad ?? []).map((r) => ({
    date: r.date,
    isMatch: matchDateSet.has(String(r.date)),
    durationMin: num(r.session_duration_minutes),
    totalDistance: num(r.total_distance),
    highSpeedDistance: coalesce(num(r.high_speed_distance), num(r.hir_dist)),
    sprintDistance: coalesce(num(r.sprint_distance), num(r.velocity_band6_total_distance)),
    maxVelocity: num(r.max_velocity),
    playerLoad: num(r.total_player_load),
    playerLoadPerMin: num(r.player_load_per_minute),
    metabolicPowerPeak: num(r.metabolic_power_peak),
    accel: coalesce(num(r.ima_accel), num(r.accelerations)),
    decel: coalesce(num(r.ima_decel), num(r.decelerations)),
    cod: codOf(r),
    accelEfforts: num(r.accel_b2_3_tot_effs_gen2),
    decelEfforts: num(r.decel_b2_3_tot_effs_gen2),
    strideCount: strideSum(r),
    strideB5: num(r.ima_fr_band5_stride_count),
    strideB6: num(r.ima_fr_band6_stride_count),
    strideB7: num(r.ima_fr_band7_stride_count),
    strideB8: num(r.ima_fr_band8_stride_count),
    clock: clockHigh(r.ima_clock_gen2),
  }));

  let vald: RawDossierInput["vald"] = null;
  try {
    const rtp = await buildRtpAssessment(sb, playerId, teamId);
    const { data: trialRows } = await sb.from("vald_forcedecks_results")
      .select("test_timestamp, raw_test_id, jump_height_cm, rsi_mod, relative_peak_power_w_kg, asymmetry_percent, is_valid")
      .eq("microplayer_id", playerId).ilike("test_type", "%CMJ%")
      .order("test_timestamp", { ascending: false }).limit(120);
    type Sess = { date: string; ts: string; jumps: number[]; rsi: number[]; pow: number[]; asym: number[] };
    const byTest = new Map<string, Sess>();
    for (const t of trialRows ?? []) {
      if (t.is_valid === false) continue;
      const key = String(t.raw_test_id ?? t.test_timestamp);
      const s = byTest.get(key) ?? { date: String(t.test_timestamp).slice(0, 10), ts: String(t.test_timestamp), jumps: [], rsi: [], pow: [], asym: [] };
      const jh = num(t.jump_height_cm); if (jh != null) s.jumps.push(jh);
      const rs = num(t.rsi_mod); if (rs != null) s.rsi.push(rs);
      const pw = num(t.relative_peak_power_w_kg); if (pw != null) s.pow.push(pw);
      const az = num(t.asymmetry_percent); if (az != null) s.asym.push(az);
      byTest.set(key, s);
    }
    const avg = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
    const tests = [...byTest.values()].sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, 16).map((s) => ({
      date: s.date, jumps: s.jumps.slice(0, 3), meanJumpCm: avg(s.jumps),
      rsiMod: avg(s.rsi) != null ? (avg(s.rsi) as number) / 100 : null,
      relPeakPowerWkg: avg(s.pow), asymmetryPct: avg(s.asym),
    }));
    const trend = [...tests].filter((t) => t.date >= start && t.meanJumpCm != null).sort((a, b) => a.date.localeCompare(b.date)).map((t) => ({ date: t.date, jumpHeightCm: t.meanJumpCm as number }));
    vald = {
      cmj: rtp.cmj ? { testDate: rtp.cmj.testDate, jumpHeightCm: rtp.cmj.jumpHeightCm, rsiMod: rtp.cmj.rsiMod, relPeakPowerWkg: rtp.cmj.relPeakPowerWkg, peakForceN: rtp.cmj.peakForceN, asymmetryPct: rtp.cmj.asymmetryPct } : null,
      imtp: rtp.imtp ? { testDate: rtp.imtp.testDate, peakForceN: rtp.imtp.peakForceN, relPeakForceNkg: rtp.imtp.relPeakForceNkg, asymmetryPct: rtp.imtp.asymmetryPct } : null,
      cmjTrend: trend,
      tests,
    };
  } catch { vald = null; }

  const { data: vbtRows } = await sb.from("gymaware_vbt_sessions").select("session_date, exercise_name, load_kg, reps, mean_velocity, peak_velocity, mean_power, peak_power").eq("player_id", playerId).order("session_date", { ascending: false }).limit(300);
  const vbt: VbtSet[] = (vbtRows ?? []).map((v) => ({ date: String(v.session_date), exercise: v.exercise_name ?? null, loadKg: num(v.load_kg), meanVelocity: num(v.mean_velocity), peakVelocity: num(v.peak_velocity), meanPower: num(v.mean_power), peakPower: num(v.peak_power) }));

  const { data: fitRows } = await sb.from("player_fitness_test").select("test_date, test_type, result_value, result_unit, mas_kmh, vo2max_est").eq("player_id", playerId).order("test_date", { ascending: false });
  const fitness: FitnessRow[] = (fitRows ?? []).map((f) => ({ date: String(f.test_date), type: String(f.test_type ?? "test"), value: num(f.result_value), unit: f.result_unit ?? null, masKmh: num(f.mas_kmh), vo2maxEst: num(f.vo2max_est) }));

  const { data: peakRows } = await sb.from("player_load_peak_period").select("date, metric, window_min, value, unit").eq("player_id", playerId).gte("date", start).lte("date", end);
  const peakPeriods: PeakPeriodRow[] = (peakRows ?? []).map((r) => ({ date: String(r.date), metric: String(r.metric), windowMin: Number(r.window_min), value: Number(r.value), unit: r.unit ?? null })).filter((r) => Number.isFinite(r.windowMin) && Number.isFinite(r.value));

  let athlete: RawDossierInput["athlete"] = null;
  try {
    const roster = await loadRoster(teamId);
    const signals = await loadAthleteSignals(teamId);
    athlete = buildAthleteProfile(athleteSquadInput(roster, signals), playerId);
  } catch { athlete = null; }

  return {
    identity: { name: p.full_name ?? "—", position: p.position, sport: p.sport, dob: p.date_of_birth, heightCm: num(body?.height_cm), massKg: num(body?.mass_kg) },
    windowDays: days, start, end,
    load, vald, vbt, matches, fitness, peakPeriods, athlete,
  };
}

/** One drill-level row (period) — used only by the per-session ZIP, not the dossier. */
export type DrillRow = {
  date: string; periodName: string | null; periodNorm: string | null; periodOrder: number | null;
  durationMin: number | null; distanceM: number | null; playerLoad: number | null; playerLoadPerMin: number | null;
  hirTotal: number | null; maxVelocity: number | null; imaAccel: number | null; imaDecel: number | null;
  imaCodTotal: number | null; metabolicPowerPeak: number | null; jumps: number | null;
};

type DrillDbRow = {
  session_date: string; period_name: string | null; period_norm: string | null; period_order: number | null;
  duration_min: number | null; distance_m: number | null; player_load: number | null; player_load_per_min: number | null;
  hir_total: number | null; max_velocity: number | null; ima_accel: number | null; ima_decel: number | null;
  ima_cod_total: number | null; metabolic_power_peak: number | null; jumps: number | null;
};

/** Per-drill rows for the player over the window, oldest date first then period order. */
export async function loadDrillRows(playerId: string, start: string, end: string): Promise<DrillRow[]> {
  const sb = getSupabase();
  const rows = await fetchAllPages<DrillDbRow>((from, to) => sb
    .from("player_drill_load")
    .select("session_date, period_name, period_norm, period_order, duration_min, distance_m, player_load, player_load_per_min, hir_total, max_velocity, ima_accel, ima_decel, ima_cod_total, metabolic_power_peak, jumps")
    .eq("player_id", playerId).gte("session_date", start).lte("session_date", end).range(from, to));
  return (rows ?? []).map((r) => ({
    date: String(r.session_date), periodName: r.period_name, periodNorm: r.period_norm, periodOrder: num(r.period_order),
    durationMin: num(r.duration_min), distanceM: num(r.distance_m), playerLoad: num(r.player_load), playerLoadPerMin: num(r.player_load_per_min),
    hirTotal: num(r.hir_total), maxVelocity: num(r.max_velocity), imaAccel: num(r.ima_accel), imaDecel: num(r.ima_decel),
    imaCodTotal: num(r.ima_cod_total), metabolicPowerPeak: num(r.metabolic_power_peak), jumps: num(r.jumps),
  })).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.periodOrder ?? 0) - (b.periodOrder ?? 0)));
}
