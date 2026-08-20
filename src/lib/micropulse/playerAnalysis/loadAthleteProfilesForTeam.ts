/**
 * Team-wide athlete-profile loader — the shared physical-CAPACITY aggregator.
 *
 * Loads a team's active roster + every physical source (GPS, VALD ForceDecks CMJ, IMTP,
 * GymAware VBT, the GPS distance power curve for Critical Speed / D'), reduces them into
 * per-player signals, and position-percentiles them into an `AthleteProfile` per player.
 *
 * Extracted from /api/coach/total-player-analysis so more than one surface (Total Player
 * Analysis + Game-Plan Fit) reads capacity from ONE consistent basis. PERFORMANCE ONLY —
 * never reads or writes the readiness colour, the load decision, or the medical view.
 */

import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { fetchAllPages } from "@/lib/supabasePaginate";
import {
  reduceGps, reduceForceDecks, reduceImtp, reduceVbt, mergeSignals,
  type GpsRow, type ForceDeckRow, type ImtpMetricRow, type VbtRow,
} from "@/lib/micropulse/playerAnalysis/athleteSignals";
import { buildCriticalSpeedSignals, type PlayerCsInput } from "@/lib/micropulse/playerAnalysis/criticalSpeedSignals";
import { loadFitnessTestSignals } from "@/lib/micropulse/playerAnalysis/fitnessTestSignals";
import { buildAthleteProfile, type SquadAthletePlayer, type SquadAthleteInput, type AthleteSignalSet, type AthleteProfile } from "@/lib/micropulse/playerAnalysis/athleteProfile";

export type RosterRow = { id: string; full_name: string; position: string | null; sport: string | null };

export async function loadRoster(teamId: string): Promise<RosterRow[]> {
  const supabase = getSupabase();
  const { data } = await supabase.from("players").select("id, full_name, position, sport, is_active").eq("team_id", teamId).eq("is_active", true);
  return ((data ?? []) as Array<{ id: string; full_name: string | null; position: string | null; sport: string | null }>)
    .map((r) => ({ id: r.id, full_name: r.full_name ?? "—", position: r.position, sport: r.sport }));
}

/** Load + reduce the physical sources for the whole team into per-players.id signals. */
export async function loadAthleteSignals(teamId: string): Promise<Map<string, AthleteSignalSet>> {
  const supabase = getSupabase();
  const gps = await fetchAllPages<GpsRow>((from, to) => supabase.from("player_external_load_daily")
    .select("player_id, date, max_velocity, ima_accel, accelerations, ima_decel, decelerations, ima_cod, cod_events, high_speed_distance, hir_dist, total_distance, session_duration_minutes, accel_b2_3_tot_effs_gen2, decel_b2_3_tot_effs_gen2, ima_clock_gen2, metabolic_power, metabolic_power_peak, player_load_per_minute, velocity_band6_total_distance, total_player_load")
    .eq("team_id", teamId).range(from, to));
  const { data: fd } = await supabase.from("vald_forcedecks_results")
    .select("microplayer_id, test_timestamp, test_type, rsi_mod, relative_peak_power_w_kg, asymmetry_percent, is_valid")
    .eq("team_id", teamId).limit(5000);
  const { data: imtp } = await supabase.from("vald_test_metrics")
    .select("microplayer_id, test_timestamp, metric_code, value, test_type")
    .eq("team_id", teamId).eq("test_type", "IMTP").in("metric_code", ["PEAK_VERTICAL_FORCE", "NET_PEAK_VERTICAL_FORCE"]).limit(5000);

  // GymAware VBT has no team_id — scope it by the roster's player ids. Guarded: if the
  // table is absent in this project the query throws, so skip VBT cleanly.
  const rosterIds = (await loadRoster(teamId)).map((r) => r.id);
  let vbt: VbtRow[] = [];
  if (rosterIds.length) {
    try {
      const { data } = await supabase.from("gymaware_vbt_sessions")
        .select("player_id, session_date, exercise_name, peak_power").in("player_id", rosterIds).limit(5000);
      vbt = (data ?? []) as VbtRow[];
    } catch { vbt = []; }
  }

  return mergeSignals([
    reduceGps(gps),
    reduceForceDecks((fd ?? []) as ForceDeckRow[]),
    reduceImtp((imtp ?? []) as ImtpMetricRow[]),
    reduceVbt(vbt),
    // Field-test aerobic estimate FIRST, then GPS Critical Speed — later wins, so a player
    // with real GPS CS keeps it and only test-only (Lite) players fall back to the estimate.
    await loadFitnessTestSignals(teamId),
    await loadCriticalSpeedSignals(teamId),
  ]);
}

/**
 * Power Curve Intelligence on the athlete radar: Critical Speed (aerobic_endurance) and D'
 * (anaerobic_reserve) per player, fit from the GPS mean-maximal DISTANCE power curve
 * (player_load_peak_period — the densest 1/3/5-min windows). Only players with a valid fit
 * (>=2 windows) emit a value; the rest read "not enough data" on the radar. Squad-percentiled
 * on one consistent basis. Descriptive conditioning — never touches the readiness colour.
 */
export async function loadCriticalSpeedSignals(teamId: string): Promise<Map<string, AthleteSignalSet>> {
  const supabase = getSupabase();
  const ppRows = await fetchAllPages<{ player_id: string; metric: string | null; window_min: number | null; value: number | null }>((from, to) =>
    supabase.from("player_load_peak_period").select("player_id, metric, window_min, value").eq("team_id", teamId).range(from, to));
  const miiBest = new Map<string, Map<number, number>>(); // player -> (window -> best m/min)
  for (const r of ppRows ?? []) {
    if (r.metric !== "distance" || r.window_min == null) continue;
    const v = Number(r.value);
    if (!Number.isFinite(v)) continue;
    const perWin = miiBest.get(r.player_id) ?? new Map<number, number>();
    const prev = perWin.get(Number(r.window_min));
    if (prev == null || v > prev) perWin.set(Number(r.window_min), v);
    miiBest.set(r.player_id, perWin);
  }
  const inputs: PlayerCsInput[] = [...miiBest.keys()].map((playerId) => ({
    playerId,
    miiPoints: [...(miiBest.get(playerId) ?? new Map()).entries()].map(([windowMin, value]) => ({ windowMin: Number(windowMin), value: Number(value) })),
    date: null,
  }));
  return buildCriticalSpeedSignals(inputs);
}

/** Shape the roster + signals into the pure engine's SquadAthleteInput (whole-squad pool). */
export function athleteSquadInput(roster: RosterRow[], signals: Map<string, AthleteSignalSet>): SquadAthleteInput {
  return {
    players: roster.map((r): SquadAthletePlayer => ({ playerId: r.id, name: r.full_name, position: r.position, signals: signals.get(r.id) ?? {} })),
    sport: roster[0]?.sport ?? null,
  };
}

/**
 * One call for a team: roster + signals + every active player's position-percentiled
 * AthleteProfile (built against the whole-squad pool, so percentiles are consistent).
 */
export async function loadAthleteProfilesForTeam(teamId: string): Promise<{
  roster: RosterRow[];
  signals: Map<string, AthleteSignalSet>;
  profiles: Map<string, AthleteProfile>;
}> {
  const roster = await loadRoster(teamId);
  const signals = await loadAthleteSignals(teamId);
  const input = athleteSquadInput(roster, signals);
  const profiles = new Map<string, AthleteProfile>();
  for (const p of roster) {
    const prof = buildAthleteProfile(input, p.id);
    if (prof) profiles.set(p.id, prof);
  }
  return { roster, signals, profiles };
}
