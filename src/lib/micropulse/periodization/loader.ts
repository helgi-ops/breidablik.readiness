import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllPages } from "@/lib/supabasePaginate";
import {
  detectSeasonPhases, buildMesoBlocks, intervalSpeedsFromMas, strengthFromVbt, dataReadiness,
  type SeasonPhase, type MesoBlock, type WeekLoad, type IntervalZone, type VbtRead, type DataGap,
} from "./index";

/**
 * Assemble the periodization recommendation from the team's OWN data — read-only, composes the pure
 * engine. Descriptive planning; never reads or writes the readiness colour. MAS from a max running
 * test (4-min ≈ vVO₂max/MAS proxy, Bellenger 2015); strength from the latest VBT set.
 */
export type PlayerPeriodization = {
  playerId: string; name: string; position: string | null;
  masKmh: number | null; masSource: string | null; masAgeDays: number | null;
  intervals: IntervalZone[]; vbt: VbtRead; gaps: DataGap[];
};
export type PeriodizationPlan = {
  seasonYear: number; generatedAt: string;
  phases: SeasonPhase[]; blocks: MesoBlock[]; loadCurve: WeekLoad[];
  players: PlayerPeriodization[];
};

const mondayOf = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`); const dow = (d.getUTCDay() + 6) % 7; // Mon=0
  return new Date(d.getTime() - dow * 86_400_000).toISOString().slice(0, 10);
};
const ageDays = (iso: string | null, todayMs: number) => (iso ? Math.round((todayMs - Date.parse(iso)) / 86_400_000) : null);

export async function loadPeriodization(sb: SupabaseClient, args: { teamId: string; seasonYear?: number }): Promise<PeriodizationPlan> {
  const todayMs = Date.now();
  const seasonYear = args.seasonYear ?? new Date().getUTCFullYear();
  const yStart = `${seasonYear}-01-01`, yEnd = `${seasonYear}-12-31`;

  // Fixtures → macro phases.
  const { data: fxData } = await sb.from("match_schedule")
    .select("match_date, competition, is_home").eq("team_id", args.teamId)
    .gte("match_date", yStart).lte("match_date", yEnd).order("match_date");
  const fixtures = ((fxData ?? []) as Array<{ match_date: string; competition: string | null; is_home: boolean | null }>)
    .map((f) => ({ date: f.match_date, competition: f.competition, isHome: f.is_home }));

  // Season daily load (paged past 1000) → weekly team Player Load curve.
  const daily = await fetchAllPages<{ date: string; player_load: number | null }>((from, to) =>
    sb.from("player_external_load_daily").select("date, player_load")
      .eq("team_id", args.teamId).gte("date", yStart).lte("date", yEnd).order("date").range(from, to));
  const weekMap = new Map<string, number>();
  let dataStart: string | null = null, dataEnd: string | null = null;
  for (const r of daily) {
    if (!r.date) continue;
    if (dataStart === null || r.date < dataStart) dataStart = r.date;
    if (dataEnd === null || r.date > dataEnd) dataEnd = r.date;
    if (typeof r.player_load === "number" && r.player_load > 0) weekMap.set(mondayOf(r.date), (weekMap.get(mondayOf(r.date)) ?? 0) + r.player_load);
  }
  const loadCurve: WeekLoad[] = [...weekMap.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    .map(([weekStart, load]) => ({ weekStart, load: Math.round(load), readiness: null }));

  const phases = detectSeasonPhases(fixtures, dataStart);
  const planStart = phases[0]?.start ?? dataStart ?? yStart;
  const planEnd = phases[phases.length - 1]?.end ?? dataEnd ?? yEnd;
  const blocks = phases.length ? buildMesoBlocks(planStart, planEnd, loadCurve, 4) : [];

  // Players + individualisation.
  const { data: plData } = await sb.from("players").select("id, full_name, position").eq("team_id", args.teamId).eq("is_active", true).order("full_name");
  const players = (plData ?? []) as Array<{ id: string; full_name: string | null; position: string | null }>;
  const ids = players.map((p) => p.id);

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

  const out: PlayerPeriodization[] = players.map((p) => {
    const run = runByPlayer.get(p.id) ?? null;
    const masAge = run ? ageDays(run.date, todayMs) : null;
    const vbt = vbtByPlayer.get(p.id) ?? null;
    const vbtAge = vbt ? ageDays(vbt.date, todayMs) : null;
    return {
      playerId: p.id, name: p.full_name ?? "Player", position: p.position ?? null,
      masKmh: run?.masKmh ?? null, masSource: run?.name ?? null, masAgeDays: masAge,
      intervals: intervalSpeedsFromMas(run?.masKmh ?? null),
      vbt: strengthFromVbt(vbt?.exercise ?? null, vbt?.loadKg ?? null, vbt?.meanV ?? null),
      gaps: dataReadiness({ hasCsTest, masAgeDays: masAge, vbtAgeDays: vbtAge, hasValdThisBlock: false }),
    };
  });

  return { seasonYear, generatedAt: new Date().toISOString(), phases, blocks, loadCurve, players: out };
}
