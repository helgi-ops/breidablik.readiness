/**
 * /api/coach/transfer-report/[playerId]
 *
 * GET — assembles a departing player's performance dossier over a 3–4 month
 * window (default 120 days) for a receiving club: VALD, VBT, GPS, IMA, Games +
 * worst-case match demands, pitch/gym fitness tests, and the position-percentiled
 * athlete profile. Loads only from tables that already exist; the shaping is done
 * by the pure engine `buildTransferDossier`. Read-only, descriptive — it never
 * touches the readiness colour, the load target, or the daily decision.
 *
 * POST — { days, lang, ai:true } → a labelled AI summary written from the same
 * numbers (rules pick the facts; the model phrases them).
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { fetchAllPages } from "@/lib/supabasePaginate";
import { oneRowPerDate } from "@/lib/micropulse/load/oneRowPerDate";
import { buildRtpAssessment } from "@/lib/micropulse/rtp/buildRtpAssessment";
import { loadRoster, loadAthleteSignals, athleteSquadInput } from "@/lib/micropulse/playerAnalysis/loadAthleteProfilesForTeam";
import { buildAthleteProfile } from "@/lib/micropulse/playerAnalysis/athleteProfile";
import { buildTransferDossier, type RawDossierInput, type LoadDaily, type VbtSet, type MatchRow, type FitnessRow, type PeakPeriodRow } from "@/lib/micropulse/transferReport";
import { buildTransferAiSummary } from "@/lib/micropulse/transferReport/ai";

export const runtime = "nodejs";

type Auth = { teamId: string } | { error: string; status: number };

async function authCoach(req: NextRequest): Promise<Auth> {
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

function windowDaysFrom(req: NextRequest): number {
  const raw = Number(new URL(req.url).searchParams.get("days"));
  if (!Number.isFinite(raw)) return 120;
  return Math.max(30, Math.min(365, Math.round(raw)));
}

type LoadRow = {
  date: string; source: string | null; session_duration_minutes: number | null;
  total_distance: number | null; high_speed_distance: number | null; hir_dist: number | null;
  sprint_distance: number | null; velocity_band6_total_distance: number | null; max_velocity: number | null;
  total_player_load: number | null; player_load_per_minute: number | null; metabolic_power_peak: number | null;
  ima_accel: number | null; accelerations: number | null; ima_decel: number | null; decelerations: number | null;
  ima_cod: number | null; cod_events: number | null; accel_b2_3_tot_effs_gen2: number | null; decel_b2_3_tot_effs_gen2: number | null;
  ima_fr_band1_stride_count: number | null; ima_fr_band2_stride_count: number | null; ima_fr_band3_stride_count: number | null;
  ima_fr_band4_stride_count: number | null; ima_fr_band5_stride_count: number | null; ima_fr_band6_stride_count: number | null;
  ima_fr_band7_stride_count: number | null; ima_fr_band8_stride_count: number | null;
  ima_clock_gen2: Record<string, { low?: number; medium?: number; high?: number }> | null;
};

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const coalesce = (...xs: Array<number | null>): number | null => xs.find((x) => x != null) ?? null;

function strideSum(r: LoadRow): number | null {
  const bands = [r.ima_fr_band1_stride_count, r.ima_fr_band2_stride_count, r.ima_fr_band3_stride_count, r.ima_fr_band4_stride_count, r.ima_fr_band5_stride_count, r.ima_fr_band6_stride_count, r.ima_fr_band7_stride_count, r.ima_fr_band8_stride_count].map(num).filter((x): x is number => x != null);
  return bands.length ? bands.reduce((a, b) => a + b, 0) : null;
}

/** High-intensity events per clock direction from the 12-direction ima_clock_gen2 grid. */
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
async function loadRawInput(teamId: string, playerId: string, days: number): Promise<RawDossierInput | { error: string; status: number }> {
  const sb = getSupabase();
  const end = new Date().toISOString().slice(0, 10);
  const start = new Date(Date.parse(end + "T00:00:00Z") - days * 86_400_000).toISOString().slice(0, 10);

  const { data: player } = await sb.from("players").select("id, full_name, position, sport, date_of_birth").eq("id", playerId).eq("team_id", teamId).maybeSingle();
  if (!player) return { error: "Player not on your team", status: 403 };
  const p = player as { id: string; full_name: string | null; position: string | null; sport: string | null; date_of_birth: string | null };

  const { data: body } = await sb.from("player_body_metrics").select("mass_kg, height_cm, measured_on").eq("player_id", playerId).order("measured_on", { ascending: false }).limit(1).maybeSingle();

  // Match dates + minutes (used both to classify GPS rows and for the Games section).
  const { data: minutesRows } = await sb.from("match_player_minutes").select("match_date, minutes_played, is_dnp").eq("player_id", playerId).gte("match_date", start).lte("match_date", end);
  const { data: statRows } = await sb.from("player_match_stats").select("match_date, opponent, minutes, goals, assists, xg").eq("player_id", playerId).gte("match_date", start).lte("match_date", end);
  const matchDateSet = new Set<string>([...(minutesRows ?? []).filter((m) => !m.is_dnp).map((m) => String(m.match_date)), ...(statRows ?? []).map((m) => String(m.match_date))]);
  const minutesByDate = new Map<string, number | null>((minutesRows ?? []).map((m) => [String(m.match_date), num(m.minutes_played)]));
  const matches: MatchRow[] = [...matchDateSet].map((d) => {
    const st = (statRows ?? []).find((s) => String(s.match_date) === d);
    return { date: d, opponent: st?.opponent ?? null, minutes: coalesce(num(st?.minutes), minutesByDate.get(d) ?? null), goals: num(st?.goals), assists: num(st?.assists), xg: num(st?.xg) };
  });

  // GPS + IMA daily rows (catapult + manual; manual corrections win per date).
  const rawLoad = await fetchAllPages<LoadRow>((from, to) => sb
    .from("player_external_load_daily")
    .select("date, source, session_duration_minutes, total_distance, high_speed_distance, hir_dist, sprint_distance, velocity_band6_total_distance, max_velocity, total_player_load, player_load_per_minute, metabolic_power_peak, ima_accel, accelerations, ima_decel, decelerations, ima_cod, cod_events, accel_b2_3_tot_effs_gen2, decel_b2_3_tot_effs_gen2, ima_fr_band1_stride_count, ima_fr_band2_stride_count, ima_fr_band3_stride_count, ima_fr_band4_stride_count, ima_fr_band5_stride_count, ima_fr_band6_stride_count, ima_fr_band7_stride_count, ima_fr_band8_stride_count, ima_clock_gen2")
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
    cod: coalesce(num(r.ima_cod), num(r.cod_events)),
    accelEfforts: num(r.accel_b2_3_tot_effs_gen2),
    decelEfforts: num(r.decel_b2_3_tot_effs_gen2),
    strideCount: strideSum(r),
    strideB5: num(r.ima_fr_band5_stride_count),
    strideB6: num(r.ima_fr_band6_stride_count),
    strideB7: num(r.ima_fr_band7_stride_count),
    strideB8: num(r.ima_fr_band8_stride_count),
    clock: clockHigh(r.ima_clock_gen2),
  }));

  // VALD — latest CMJ/IMTP via the RTP assessment, plus an in-window CMJ trend.
  let vald: RawDossierInput["vald"] = null;
  try {
    const rtp = await buildRtpAssessment(sb, playerId, teamId);
    const { data: trendRows } = await sb.from("vald_forcedecks_results").select("test_timestamp, jump_height_cm, test_type").eq("microplayer_id", playerId).ilike("test_type", "%CMJ%").gte("test_timestamp", start + "T00:00:00Z").order("test_timestamp", { ascending: true });
    const trendByDate = new Map<string, number>();
    for (const t of trendRows ?? []) {
      const jh = num(t.jump_height_cm);
      if (jh != null) trendByDate.set(String(t.test_timestamp).slice(0, 10), jh);
    }
    vald = {
      cmj: rtp.cmj ? { testDate: rtp.cmj.testDate, jumpHeightCm: rtp.cmj.jumpHeightCm, rsiMod: rtp.cmj.rsiMod, relPeakPowerWkg: rtp.cmj.relPeakPowerWkg, peakForceN: rtp.cmj.peakForceN, asymmetryPct: rtp.cmj.asymmetryPct } : null,
      imtp: rtp.imtp ? { testDate: rtp.imtp.testDate, peakForceN: rtp.imtp.peakForceN, relPeakForceNkg: rtp.imtp.relPeakForceNkg, asymmetryPct: rtp.imtp.asymmetryPct } : null,
      cmjTrend: [...trendByDate.entries()].map(([date, jumpHeightCm]) => ({ date, jumpHeightCm })),
    };
  } catch { vald = null; }

  // VBT (GymAware) — keyed on player_id, no team_id column.
  const { data: vbtRows } = await sb.from("gymaware_vbt_sessions").select("session_date, exercise_name, load_kg, reps, mean_velocity, peak_velocity, mean_power, peak_power").eq("player_id", playerId).gte("session_date", start).lte("session_date", end);
  const vbt: VbtSet[] = (vbtRows ?? []).map((v) => ({ date: String(v.session_date), exercise: v.exercise_name ?? null, loadKg: num(v.load_kg), meanVelocity: num(v.mean_velocity), peakVelocity: num(v.peak_velocity), meanPower: num(v.mean_power), peakPower: num(v.peak_power) }));

  // Fitness tests — latest per type (not date-restricted; these are infrequent).
  const { data: fitRows } = await sb.from("player_fitness_test").select("test_date, test_type, result_value, result_unit, mas_kmh, vo2max_est").eq("player_id", playerId).order("test_date", { ascending: false });
  const fitness: FitnessRow[] = (fitRows ?? []).map((f) => ({ date: String(f.test_date), type: String(f.test_type ?? "test"), value: num(f.result_value), unit: f.result_unit ?? null, masKmh: num(f.mas_kmh), vo2maxEst: num(f.vo2max_est) }));

  // Worst-case-scenario — true rolling peak period, if the export is present.
  const { data: peakRows } = await sb.from("player_load_peak_period").select("date, metric, window_min, value, unit").eq("player_id", playerId).gte("date", start).lte("date", end);
  const peakPeriods: PeakPeriodRow[] = (peakRows ?? []).map((r) => ({ date: String(r.date), metric: String(r.metric), windowMin: Number(r.window_min), value: Number(r.value), unit: r.unit ?? null })).filter((r) => Number.isFinite(r.windowMin) && Number.isFinite(r.value));

  // Athlete profile — same build as Total Player Analysis (position percentiles).
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

async function consentOk(playerId: string): Promise<boolean> {
  const sb = getSupabase();
  const { data } = await sb.from("player_consents").select("id, revoked_at").eq("player_id", playerId).ilike("consent_type", "%data_processing%").is("revoked_at", null).limit(1);
  return (data?.length ?? 0) > 0;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ playerId: string }> }) {
  const { playerId } = await params;
  const auth = await authCoach(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const raw = await loadRawInput(auth.teamId, playerId, windowDaysFrom(req));
  if ("error" in raw) return NextResponse.json({ error: raw.error }, { status: raw.status });
  const dossier = buildTransferDossier(raw);
  const consent = await consentOk(playerId).catch(() => false);
  return NextResponse.json({ ok: true, dossier, consentOk: consent });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ playerId: string }> }) {
  const { playerId } = await params;
  const auth = await authCoach(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = await req.json().catch(() => ({}));
  if (!body?.ai) return NextResponse.json({ error: "Nothing to do" }, { status: 400 });
  const days = Math.max(30, Math.min(365, Math.round(Number(body.days) || 120)));
  const lang = body.lang === "IS" ? "IS" : "EN";
  const raw = await loadRawInput(auth.teamId, playerId, days);
  if ("error" in raw) return NextResponse.json({ error: raw.error }, { status: raw.status });
  const dossier = buildTransferDossier(raw);
  try {
    const ai = await buildTransferAiSummary(dossier, lang);
    return NextResponse.json({ ok: true, ai });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "AI error" }, { status: 500 });
  }
}
