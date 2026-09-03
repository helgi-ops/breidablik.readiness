import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllPages } from "@/lib/supabasePaginate";
import {
  detectSeasonPhases, buildMesoBlocks, intervalSpeedsFromMas, strengthFromVbt, dataReadiness,
  valdVolumeCap, strengthDefaultForBlock, teamAverages, positionGroup, dataTier,
  classifyMatchWeek, congestedWeeks, matchAxisTargets, computeMatchUnit, weeklyTargetFromMatch,
  type SeasonPhase, type MesoBlock, type WeekLoad, type IntervalZone, type VbtRead, type DataGap,
  type ValdCap, type StrengthDefault, type TeamAverages, type SessionRow, type Bi, type TierRead, type MatchWeekType, type MatchAxes,
  type PlayerMatchRow, type MatchUnit, type WeekTargetPlan,
} from "./index";
import { computePeakMovementSignature, sumClocks } from "@/lib/micropulse/peakMovementSignature";
import type { ClockGrid } from "@/lib/micropulse/directionalSignature";

/**
 * Assemble the periodization recommendation from the team's OWN data — read-only, composes the pure
 * engine. Descriptive planning; never reads or writes the readiness colour. MAS from a max running
 * test (4-min ≈ vVO₂max/MAS proxy, Bellenger 2015); strength from the latest VBT set.
 */
export type PlayerPeriodization = {
  playerId: string; name: string; position: string | null;
  masKmh: number | null; masSource: string | null; masAgeDays: number | null;
  intervals: IntervalZone[]; vbt: VbtRead; strengthFallback: StrengthDefault | null;
  vald: ValdCap; gaps: DataGap[];
  matchUnit: MatchUnit; weekTargets: { preseason: WeekTargetPlan; inseason: WeekTargetPlan; current: "preseason" | "inseason" };
};
export type PositionBaseline = { key: number; label: Bi; avg: TeamAverages; axes: MatchAxes };
export type PeriodizationPlan = {
  seasonYear: number; generatedAt: string;
  phases: SeasonPhase[]; blocks: MesoBlock[]; loadCurve: WeekLoad[]; positionBaselines: PositionBaseline[];
  tier: TierRead; mdShape: Record<string, number>; nextWeekType: MatchWeekType; matchLoad: number | null;
  congested: Array<{ weekStart: string; matches: number }>; players: PlayerPeriodization[];
};

const mondayOf = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`); const dow = (d.getUTCDay() + 6) % 7; // Mon=0
  return new Date(d.getTime() - dow * 86_400_000).toISOString().slice(0, 10);
};
const ageDays = (iso: string | null, todayMs: number) => (iso ? Math.round((todayMs - Date.parse(iso)) / 86_400_000) : null);

export async function loadPeriodization(sb: SupabaseClient, args: { teamId: string; seasonYear?: number; preseasonStart?: string | null; seasonEnd?: string | null }): Promise<PeriodizationPlan> {
  const todayMs = Date.now();
  const seasonYear = args.seasonYear ?? new Date().getUTCFullYear();
  const yStart = `${seasonYear}-01-01`, yEnd = `${seasonYear}-12-31`;

  // Fixtures → macro phases.
  const { data: fxData } = await sb.from("match_schedule")
    .select("match_date, competition, is_home").eq("team_id", args.teamId)
    .gte("match_date", yStart).lte("match_date", yEnd).order("match_date");
  const fixtures = ((fxData ?? []) as Array<{ match_date: string; competition: string | null; is_home: boolean | null }>)
    .map((f) => ({ date: f.match_date, competition: f.competition, isHome: f.is_home }));

  const matchDates = new Set(fixtures.map((f) => f.date));

  // Season daily GPS/IMA (paged past 1000) → weekly team Player Load curve + the squad baseline.
  // Richer mechanical/IMA columns (Band 2–3 high-intensity effort counts, top-band free-running strides,
  // RHIE / running symmetry / metabolic power) are pulled too — rendered only where the feed carries them.
  type Raw = { date: string; player_load: number | null; total_distance: number | null; velocity_band5_total_distance: number | null; velocity_band6_total_distance: number | null; ima_accel: number | null; ima_decel: number | null; player_load_per_minute: number | null; max_velocity: number | null; ima_clock_gen2: ClockGrid | null; player_id: string | null; accel_b2_3_tot_effs_gen2: number | null; decel_b2_3_tot_effs_gen2: number | null; ima_fr_band6_stride_count: number | null; ima_fr_band7_stride_count: number | null; ima_fr_band8_stride_count: number | null; rhie_bouts: number | null; running_symmetry: number | null; metabolic_power: number | null };
  const daily = await fetchAllPages<Raw>((from, to) =>
    sb.from("player_external_load_daily").select("date, player_id, player_load, total_distance, velocity_band5_total_distance, velocity_band6_total_distance, ima_accel, ima_decel, player_load_per_minute, max_velocity, ima_clock_gen2, accel_b2_3_tot_effs_gen2, decel_b2_3_tot_effs_gen2, ima_fr_band6_stride_count, ima_fr_band7_stride_count, ima_fr_band8_stride_count, rhie_bouts, running_symmetry, metabolic_power")
      .eq("team_id", args.teamId).gte("date", yStart).lte("date", yEnd).order("date").range(from, to));
  const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
  let dataStart: string | null = null, dataEnd: string | null = null;
  let hasGps = false, hasIma = false;
  // Keep each session with its player_id + clock so we can bucket by position AFTER the roster loads.
  const rawSessions: Array<SessionRow & { pid: string | null; clock: ClockGrid | null }> = [];
  const gpsLoad: Array<{ date: string; load: number }> = []; // per-session external load (Player Load)
  // Per-player match rows (near-full-match unit) — keyed by player, filled from match-date GPS rows below.
  const matchRowByPlayer = new Map<string, PlayerMatchRow[]>();
  for (const r of daily) {
    if (!r.date) continue;
    if (dataStart === null || r.date < dataStart) dataStart = r.date;
    if (dataEnd === null || r.date > dataEnd) dataEnd = r.date;
    if (typeof r.player_load === "number" && r.player_load > 0) { hasGps = true; gpsLoad.push({ date: r.date, load: r.player_load }); }
    if (r.ima_accel != null) hasIma = true;
    const v5 = num(r.velocity_band5_total_distance), v6 = num(r.velocity_band6_total_distance);
    const strideHiParts = [num(r.ima_fr_band6_stride_count), num(r.ima_fr_band7_stride_count), num(r.ima_fr_band8_stride_count)].filter((x): x is number => x != null);
    const strideHi = strideHiParts.length ? strideHiParts.reduce((a, b) => a + b, 0) : null;
    const hsr = v5 != null || v6 != null ? (v5 ?? 0) + (v6 ?? 0) : null;
    rawSessions.push({
      isMatch: matchDates.has(r.date),
      distanceM: num(r.total_distance), hsrM: hsr, sprintM: v6,
      maxKmh: num(r.max_velocity), playerLoad: num(r.player_load), plPerMin: num(r.player_load_per_minute),
      accel: num(r.ima_accel), decel: num(r.ima_decel), pid: r.player_id, clock: r.ima_clock_gen2 ?? null,
      accelHiEff: num(r.accel_b2_3_tot_effs_gen2), decelHiEff: num(r.decel_b2_3_tot_effs_gen2), strideHi,
      rhieBouts: num(r.rhie_bouts), runSymmetry: num(r.running_symmetry), metabolicPower: num(r.metabolic_power),
    });
    if (r.player_id && matchDates.has(r.date)) {
      const arr = matchRowByPlayer.get(r.player_id) ?? [];
      arr.push({ date: r.date, minutes: null, load: num(r.player_load), hsr, sprint: v6, distance: num(r.total_distance), accel: num(r.ima_accel), decel: num(r.ima_decel) });
      matchRowByPlayer.set(r.player_id, arr);
    }
  }

  // sRPE (session_load_au = RPE × min) — the no-GPS fallback so the plan builds for EVERY club.
  const srpe = await fetchAllPages<{ session_date: string; session_load_au: number | null; rpe: number | null; duration_min: number | null }>((from, to) =>
    sb.from("player_session_rpe").select("session_date, session_load_au, rpe, duration_min").eq("team_id", args.teamId).gte("session_date", yStart).lte("session_date", yEnd).range(from, to));
  const srpeLoad: Array<{ date: string; load: number }> = [];
  for (const r of srpe) {
    const au = num(r.session_load_au) ?? (num(r.rpe) != null && num(r.duration_min) != null ? (r.rpe as number) * (r.duration_min as number) : null);
    if (r.session_date && au != null && au > 0) { srpeLoad.push({ date: r.session_date, load: au }); if (dataStart === null || r.session_date < dataStart) dataStart = r.session_date; if (dataEnd === null || r.session_date > dataEnd) dataEnd = r.session_date; }
  }
  const tier = dataTier({ ima: hasIma, gps: hasGps, rpe: srpeLoad.length > 0 });
  // Load curve + MD shape come from the best source the club has (GPS external load, else sRPE).
  const loadEntries = tier.loadSource === "gps" ? gpsLoad : tier.loadSource === "srpe" ? srpeLoad : [];
  const weekMap = new Map<string, number>();
  for (const e of loadEntries) weekMap.set(mondayOf(e.date), (weekMap.get(mondayOf(e.date)) ?? 0) + e.load);
  const loadCurve: WeekLoad[] = [...weekMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([weekStart, load]) => ({ weekStart, load: Math.round(load), readiness: null }));

  // The team's OWN taper shape: average load at each MD-relative day ÷ the overall session average.
  const fixtureMs = fixtures.map((f) => Date.parse(f.date)).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  const offsetSums = new Map<number, { sum: number; n: number }>();
  const nearestOffset = (dateMs: number): number | null => {
    if (fixtureMs.length === 0) return null;
    let best = Infinity;
    for (const fm of fixtureMs) { const d = Math.round((dateMs - fm) / 86_400_000); if (Math.abs(d) < Math.abs(best)) best = d; }
    return Number.isFinite(best) ? best : null;
  };
  const overallAvg = loadEntries.length ? loadEntries.reduce((s, e) => s + e.load, 0) / loadEntries.length : 0;
  for (const e of loadEntries) {
    const off = nearestOffset(Date.parse(e.date));
    if (off == null || off < -6 || off > 2) continue;
    const b = offsetSums.get(off) ?? { sum: 0, n: 0 }; b.sum += e.load; b.n += 1; offsetSums.set(off, b);
  }
  const mdShape: Record<string, number> = {};
  if (overallAvg > 0) for (const [off, b] of offsetSums) { if (b.n >= 3) mdShape[off < 0 ? `MD${off}` : off > 0 ? `MD+${off}` : "MD"] = Math.round((b.sum / b.n / overallAvg) * 100) / 100; }

  // Congested weeks (2+ matches / week) + the type of the NEXT microcycle (gap between the next two fixtures).
  const congested = congestedWeeks(fixtures.map((f) => f.date));
  const upcoming = fixtureMs.filter((m) => m >= todayMs - 86_400_000).sort((a, b) => a - b);
  const nextWeekType = upcoming.length >= 2 ? classifyMatchWeek(Math.round((upcoming[1] - upcoming[0]) / 86_400_000)) : "normal";

  // The team's typical single-match load (same currency as the load curve) — the UNIT that TMr divides by.
  const matchLoadEntries = loadEntries.filter((e) => matchDates.has(e.date)).map((e) => e.load);
  const matchLoad = matchLoadEntries.length ? Math.round(matchLoadEntries.reduce((s, v) => s + v, 0) / matchLoadEntries.length) : null;

  const phases = detectSeasonPhases(fixtures, dataStart, { preseasonStart: args.preseasonStart, seasonEnd: args.seasonEnd });
  const planStart = phases[0]?.start ?? dataStart ?? yStart;
  const planEnd = phases[phases.length - 1]?.end ?? dataEnd ?? yEnd;
  const blocks = phases.length ? buildMesoBlocks(planStart, planEnd, loadCurve, 4, matchLoad) : [];

  // Players + individualisation.
  const { data: plData } = await sb.from("players").select("id, full_name, position").eq("team_id", args.teamId).eq("is_active", true).order("full_name");
  const players = (plData ?? []) as Array<{ id: string; full_name: string | null; position: string | null }>;
  const ids = players.map((p) => p.id);

  // Squad baseline PER POSITION — peak demands are position-specific (Ju), so a player without his
  // own test falls back to HIS position's average, not the whole team's.
  const pidGroup = new Map<string, { key: number; label: Bi }>();
  for (const p of players) pidGroup.set(p.id, positionGroup(p.position));
  const groups = new Map<number, { label: Bi; rows: SessionRow[]; clocks: Array<ClockGrid | null>; players: Set<string> }>();
  for (const s of rawSessions) {
    const g = (s.pid && pidGroup.get(s.pid)) || positionGroup(null);
    const bucket = groups.get(g.key) ?? { label: g.label, rows: [], clocks: [], players: new Set<string>() };
    bucket.rows.push(s);
    if (s.clock) bucket.clocks.push(s.clock);
    if (s.pid) bucket.players.add(s.pid);
    groups.set(g.key, bucket);
  }
  const positionBaselines = [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([key, b]) => {
    let direction: TeamAverages["direction"] = null;
    const summed = sumClocks(b.clocks);
    if (summed) {
      const sig = computePeakMovementSignature({ clock: summed });
      if (sig.hasData && sig.segments.length) {
        const sh = (k: "forward" | "backward" | "multidirectional") => sig.segments.find((s) => s.key === k)?.share ?? 0;
        direction = { forward: sh("forward"), backward: sh("backward"), lateral: sh("multidirectional") };
      }
    }
    const avg = teamAverages(b.rows, direction);
    avg.players = b.players.size;
    return { key, label: b.label, avg, axes: matchAxisTargets(avg) };
  });

  // Latest max running test per player (MAS proxy). speed_m_per_min → km/h.
  const runByPlayer = new Map<string, { masKmh: number; date: string; name: string }>();
  if (ids.length) {
    const { data: rt } = await sb.from("player_running_test")
      .select("player_id, test_date, test_name, speed_m_per_min, distance_m, duration_s")
      .eq("team_id", args.teamId).order("test_date", { ascending: false });
    for (const r of (rt ?? []) as Array<{ player_id: string; test_date: string; test_name: string | null; speed_m_per_min: number | null; distance_m: number | null; duration_s: number | null }>) {
      if (runByPlayer.has(r.player_id)) continue; // latest wins (ordered desc)
      const kmh = r.speed_m_per_min != null ? r.speed_m_per_min * 0.06
        : r.distance_m != null && r.duration_s ? (r.distance_m / r.duration_s) * 3.6 : null;
      if (kmh != null && kmh > 0) runByPlayer.set(r.player_id, { masKmh: Math.round(kmh * 10) / 10, date: r.test_date, name: r.test_name ?? "run test" });
    }
  }
  // Any Critical Speed test for the squad? (Breiðablik has none → the gap panel says so.)
  const { count: csCount } = await sb.from("player_cs_test").select("id", { count: "exact", head: true }).eq("team_id", args.teamId);
  const hasCsTest = (csCount ?? 0) > 0;

  // Latest VBT set per player (heaviest recent lift).
  const vbtByPlayer = new Map<string, { exercise: string; loadKg: number | null; meanV: number | null; date: string }>();
  if (ids.length) {
    const vbt = await fetchAllPages<{ player_id: string; session_date: string; exercise_name: string; load_kg: number | null; mean_velocity: number | null }>((from, to) =>
      sb.from("gymaware_vbt_sessions").select("player_id, session_date, exercise_name, load_kg, mean_velocity")
        .in("player_id", ids).order("session_date", { ascending: false }).range(from, to));
    for (const r of vbt) {
      const cur = vbtByPlayer.get(r.player_id);
      // keep the heaviest set from his most recent session date
      if (!cur || r.session_date > cur.date || (r.session_date === cur.date && (r.load_kg ?? 0) > (cur.loadKg ?? 0))) {
        vbtByPlayer.set(r.player_id, { exercise: r.exercise_name, loadKg: r.load_kg, meanV: r.mean_velocity, date: r.session_date });
      }
    }
  }

  // Latest VALD daily snapshot per player (readiness to LOAD — volume cap; microplayer_id = player id).
  const valdByPlayer = new Map<string, { status: string | null; hamstring: string | null; date: string }>();
  if (ids.length) {
    const { data: vs } = await sb.from("vald_daily_player_snapshot")
      .select("microplayer_id, snapshot_date, overall_vald_status, hamstring_flag")
      .eq("team_id", args.teamId).in("microplayer_id", ids).order("snapshot_date", { ascending: false });
    for (const r of (vs ?? []) as Array<{ microplayer_id: string; snapshot_date: string; overall_vald_status: string | null; hamstring_flag: string | null }>) {
      if (!valdByPlayer.has(r.microplayer_id)) valdByPlayer.set(r.microplayer_id, { status: r.overall_vald_status, hamstring: r.hamstring_flag, date: r.snapshot_date });
    }
  }
  // The block "now" sits in → its strength quality is the no-VBT fallback default.
  const todayIso = new Date(todayMs).toISOString().slice(0, 10);
  const curBlock = blocks.find((b) => b.start <= todayIso && todayIso < b.end) ?? blocks.find((b) => !b.isDeload) ?? blocks[0] ?? null;

  // Match minutes → attach to the per-player match rows so the match-unit filter (near-full ≥80 min) works.
  const minutesByKey = new Map<string, number>();
  if (ids.length) {
    const mins = await fetchAllPages<{ player_id: string; match_date: string; minutes_played: number | null }>((from, to) =>
      sb.from("match_player_minutes").select("player_id, match_date, minutes_played").eq("team_id", args.teamId).gte("match_date", yStart).lte("match_date", yEnd).range(from, to));
    for (const m of mins) if (m.player_id && m.match_date && m.minutes_played != null) minutesByKey.set(`${m.player_id}|${m.match_date}`, m.minutes_played);
  }
  for (const [pid, rows] of matchRowByPlayer) for (const r of rows) r.minutes = minutesByKey.get(`${pid}|${r.date}`) ?? r.minutes;
  // Current macro phase (pre-season vs in-season) → drives the match-multiple math.
  const curPhaseKey = phases.find((ph) => ph.start <= todayIso && todayIso < ph.end)?.key ?? (phases[phases.length - 1]?.key ?? "competitive");
  const inSeasonNow = curPhaseKey !== "preseason";

  const out: PlayerPeriodization[] = players.map((p) => {
    const run = runByPlayer.get(p.id) ?? null;
    const masAge = run ? ageDays(run.date, todayMs) : null;
    const vbt = vbtByPlayer.get(p.id) ?? null;
    const vbtAge = vbt ? ageDays(vbt.date, todayMs) : null;
    const vs = valdByPlayer.get(p.id) ?? null;
    const vald = valdVolumeCap(vs?.status ?? null, vs?.hamstring ?? null);
    const valdFresh = vs != null && (ageDays(vs.date, todayMs) ?? 999) <= 21;
    const vbtRead = strengthFromVbt(vbt?.exercise ?? null, vbt?.loadKg ?? null, vbt?.meanV ?? null);
    // The player's own match unit (median of near-full matches, per axis) + the weekly target it implies.
    const matchUnit = computeMatchUnit(matchRowByPlayer.get(p.id) ?? [], { asOfMs: todayMs });
    const capPct = vald.capPct ?? 100;
    const weekTargets = {
      preseason: weeklyTargetFromMatch(matchUnit.load.typical, { phase: "preseason", sessionCount: 5, readinessCapPct: capPct, minutesTypical: matchUnit.minutesTypical }),
      inseason: weeklyTargetFromMatch(matchUnit.load.typical, { phase: "inseason", sessionCount: 4, readinessCapPct: capPct, minutesTypical: matchUnit.minutesTypical }),
      current: inSeasonNow ? ("inseason" as const) : ("preseason" as const),
    };
    return {
      playerId: p.id, name: p.full_name ?? "Player", position: p.position ?? null,
      masKmh: run?.masKmh ?? null, masSource: run?.name ?? null, masAgeDays: masAge,
      intervals: intervalSpeedsFromMas(run?.masKmh ?? null),
      vbt: vbtRead,
      strengthFallback: vbtRead ? null : (curBlock ? strengthDefaultForBlock(curBlock.phase.en, curBlock.isDeload) : null),
      vald,
      matchUnit, weekTargets,
      gaps: dataReadiness({ hasCsTest, masAgeDays: masAge, vbtAgeDays: vbtAge, hasValdThisBlock: valdFresh }),
    };
  });

  return { seasonYear, generatedAt: new Date().toISOString(), phases, blocks, loadCurve, positionBaselines, tier, mdShape, nextWeekType, matchLoad, congested, players: out };
}
