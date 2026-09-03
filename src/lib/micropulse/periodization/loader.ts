import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllPages } from "@/lib/supabasePaginate";
import {
  detectSeasonPhases, buildMesoBlocks, intervalSpeedsFromMas, strengthFromVbt, dataReadiness,
  valdVolumeCap, strengthDefaultForBlock, teamAverages, positionGroup,
  type SeasonPhase, type MesoBlock, type WeekLoad, type IntervalZone, type VbtRead, type DataGap,
  type ValdCap, type StrengthDefault, type TeamAverages, type SessionRow, type Bi,
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
};
export type PositionBaseline = { key: number; label: Bi; avg: TeamAverages };
export type PeriodizationPlan = {
  seasonYear: number; generatedAt: string;
  phases: SeasonPhase[]; blocks: MesoBlock[]; loadCurve: WeekLoad[]; positionBaselines: PositionBaseline[];
  players: PlayerPeriodization[];
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
  type Raw = { date: string; player_load: number | null; total_distance: number | null; velocity_band5_total_distance: number | null; velocity_band6_total_distance: number | null; ima_accel: number | null; ima_decel: number | null; player_load_per_minute: number | null; max_velocity: number | null; ima_clock_gen2: ClockGrid | null; player_id: string | null };
  const daily = await fetchAllPages<Raw>((from, to) =>
    sb.from("player_external_load_daily").select("date, player_id, player_load, total_distance, velocity_band5_total_distance, velocity_band6_total_distance, ima_accel, ima_decel, player_load_per_minute, max_velocity, ima_clock_gen2")
      .eq("team_id", args.teamId).gte("date", yStart).lte("date", yEnd).order("date").range(from, to));
  const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const weekMap = new Map<string, number>();
  let dataStart: string | null = null, dataEnd: string | null = null;
  // Keep each session with its player_id + clock so we can bucket by position AFTER the roster loads.
  const rawSessions: Array<SessionRow & { pid: string | null; clock: ClockGrid | null }> = [];
  for (const r of daily) {
    if (!r.date) continue;
    if (dataStart === null || r.date < dataStart) dataStart = r.date;
    if (dataEnd === null || r.date > dataEnd) dataEnd = r.date;
    if (typeof r.player_load === "number" && r.player_load > 0) weekMap.set(mondayOf(r.date), (weekMap.get(mondayOf(r.date)) ?? 0) + r.player_load);
    const v5 = num(r.velocity_band5_total_distance), v6 = num(r.velocity_band6_total_distance);
    rawSessions.push({
      isMatch: matchDates.has(r.date),
      distanceM: num(r.total_distance), hsrM: v5 != null || v6 != null ? (v5 ?? 0) + (v6 ?? 0) : null, sprintM: v6,
      maxKmh: num(r.max_velocity), playerLoad: num(r.player_load), plPerMin: num(r.player_load_per_minute),
      accel: num(r.ima_accel), decel: num(r.ima_decel), pid: r.player_id, clock: r.ima_clock_gen2 ?? null,
    });
  }
  const loadCurve: WeekLoad[] = [...weekMap.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    .map(([weekStart, load]) => ({ weekStart, load: Math.round(load), readiness: null }));

  const phases = detectSeasonPhases(fixtures, dataStart, { preseasonStart: args.preseasonStart, seasonEnd: args.seasonEnd });
  const planStart = phases[0]?.start ?? dataStart ?? yStart;
  const planEnd = phases[phases.length - 1]?.end ?? dataEnd ?? yEnd;
  const blocks = phases.length ? buildMesoBlocks(planStart, planEnd, loadCurve, 4) : [];

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
    return { key, label: b.label, avg };
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

  const out: PlayerPeriodization[] = players.map((p) => {
    const run = runByPlayer.get(p.id) ?? null;
    const masAge = run ? ageDays(run.date, todayMs) : null;
    const vbt = vbtByPlayer.get(p.id) ?? null;
    const vbtAge = vbt ? ageDays(vbt.date, todayMs) : null;
    const vs = valdByPlayer.get(p.id) ?? null;
    const vald = valdVolumeCap(vs?.status ?? null, vs?.hamstring ?? null);
    const valdFresh = vs != null && (ageDays(vs.date, todayMs) ?? 999) <= 21;
    const vbtRead = strengthFromVbt(vbt?.exercise ?? null, vbt?.loadKg ?? null, vbt?.meanV ?? null);
    return {
      playerId: p.id, name: p.full_name ?? "Player", position: p.position ?? null,
      masKmh: run?.masKmh ?? null, masSource: run?.name ?? null, masAgeDays: masAge,
      intervals: intervalSpeedsFromMas(run?.masKmh ?? null),
      vbt: vbtRead,
      strengthFallback: vbtRead ? null : (curBlock ? strengthDefaultForBlock(curBlock.phase.en, curBlock.isDeload) : null),
      vald,
      gaps: dataReadiness({ hasCsTest, masAgeDays: masAge, vbtAgeDays: vbtAge, hasValdThisBlock: valdFresh }),
    };
  });

  return { seasonYear, generatedAt: new Date().toISOString(), phases, blocks, loadCurve, positionBaselines, players: out };
}
