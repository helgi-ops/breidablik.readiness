import "server-only";

/**
 * CCC loader — assembles the pure `CccReadInput` for a player from the DB, reusing
 * the existing match-unit math (`computeMatchUnit`) and force-plate assessment
 * (`buildRtpAssessment`). Focused per-player queries (no team-wide load):
 *   - game-load baseline: the player's own near-full matches → match unit,
 *   - recent on-pitch load: peak per variable over a recent window,
 *   - force-plate gate numbers: CMJ/IMTP/hop-RSI/Nordic asymmetry + LSI,
 *   - GPS / force-plate presence to gate the quantitative read.
 * Descriptive — never the readiness colour.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { computeMatchUnit, type PlayerMatchRow } from "@/lib/micropulse/periodization";
import { buildRtpAssessment } from "@/lib/micropulse/rtp/buildRtpAssessment";
import type { CccReadInput, CccGateValues } from "./bands";
import type { CccPhaseKey, CccVariable } from "./continuum";

const num = (v: unknown): number | null => (v == null || Number.isNaN(Number(v)) ? null : Number(v));
const MATCH_SOURCES = ["catapult", "manual", "titan", "wimu"];

type LoadRow = {
  date: string; source?: string | null; player_load: number | null; total_distance: number | null;
  velocity_band5_total_distance: number | null; velocity_band6_total_distance: number | null;
  accel_b2_3_tot_effs_gen2: number | null; decel_b2_3_tot_effs_gen2: number | null;
  ima_accel: number | null; ima_decel: number | null; raw_payload_json: { estimated?: boolean } | null;
};
const LOAD_COLS = "date, source, player_load, total_distance, velocity_band5_total_distance, velocity_band6_total_distance, accel_b2_3_tot_effs_gen2, decel_b2_3_tot_effs_gen2, ima_accel, ima_decel, raw_payload_json";

const isReal = (r: LoadRow): boolean => r.raw_payload_json?.estimated !== true;
const toMatchRow = (r: LoadRow, minutes: number | null): PlayerMatchRow => ({
  date: r.date, minutes,
  distance: num(r.total_distance), hsr: num(r.velocity_band5_total_distance), sprint: num(r.velocity_band6_total_distance),
  load: num(r.player_load), accel: num(r.ima_accel), decel: num(r.ima_decel),
  accHiEff: num(r.accel_b2_3_tot_effs_gen2), decHiEff: num(r.decel_b2_3_tot_effs_gen2),
});

/** Peak of each CCC variable over the recent window (the hardest recent session). */
function peakRecent(rows: LoadRow[]): Partial<Record<CccVariable, number | null>> {
  const pick = (f: (r: LoadRow) => number | null): number | null => {
    const vals = rows.map(f).filter((x): x is number => x != null);
    return vals.length ? Math.max(...vals) : null;
  };
  return {
    distance: pick((r) => num(r.total_distance)),
    hsr: pick((r) => num(r.velocity_band5_total_distance)),
    sprint: pick((r) => num(r.velocity_band6_total_distance)),
    accel: pick((r) => num(r.accel_b2_3_tot_effs_gen2)),
    decel: pick((r) => num(r.decel_b2_3_tot_effs_gen2)),
  };
}

export async function loadCccInput(
  sb: SupabaseClient,
  teamId: string,
  playerId: string,
  phaseKey: CccPhaseKey,
  injuryCategory: string,
  opts?: { recentDays?: number },
): Promise<CccReadInput> {
  const recentDays = opts?.recentDays ?? 14;
  const todayIso = new Date().toISOString().slice(0, 10);
  const recentFrom = new Date(Date.now() - recentDays * 86_400_000).toISOString().slice(0, 10);

  const [minutesRes, recentRes, rtp] = await Promise.all([
    sb.from("match_player_minutes").select("match_date, minutes_played").eq("player_id", playerId),
    sb.from("player_external_load_daily").select(LOAD_COLS).eq("player_id", playerId).gte("date", recentFrom).lte("date", todayIso),
    buildRtpAssessment(sb, playerId, teamId).catch(() => null),
  ]);

  // Match-day GPS rows → player match unit (the 100% game-load reference).
  const minutesByDate = new Map<string, number>();
  for (const r of (minutesRes.data ?? []) as Array<{ match_date: string; minutes_played: number | null }>) {
    if (r.minutes_played != null) minutesByDate.set(r.match_date, Number(r.minutes_played));
  }
  const matchDates = [...minutesByDate.keys()];
  let matchUnit = null as ReturnType<typeof computeMatchUnit> | null;
  if (matchDates.length) {
    const { data: matchLoad } = await sb.from("player_external_load_daily").select(LOAD_COLS)
      .eq("player_id", playerId).in("date", matchDates).in("source", MATCH_SOURCES);
    const rows = ((matchLoad ?? []) as LoadRow[]).filter(isReal).map((r) => toMatchRow(r, minutesByDate.get(r.date) ?? null));
    if (rows.length) matchUnit = computeMatchUnit(rows);
  }

  const recentRows = ((recentRes.data ?? []) as LoadRow[]).filter(isReal);
  const recentActual = peakRecent(recentRows);
  const hasGps = recentRows.some((r) => (num(r.player_load) ?? 0) > 0 || (num(r.total_distance) ?? 0) > 0);

  // Force-plate gate numbers from the existing RTP assessment.
  const gateValues: CccGateValues = {};
  let hasForcePlate = false;
  if (rtp) {
    hasForcePlate = !!(rtp.cmj || rtp.imtp || rtp.battery?.length || rtp.limbStrength?.length);
    gateValues.cmj_asymmetry_pct = rtp.cmj?.asymmetryPct ?? null;
    gateValues.imtp_lsi_pct = rtp.imtp?.lsiPct ?? null;
    const hop = (rtp.battery ?? []).find((t) => t.lsiPct != null);
    gateValues.hop_rsi_lsi_pct = hop?.lsiPct ?? null;
    const nordic = (rtp.limbStrength ?? []).find((t) => t.device === "nordbord");
    gateValues.nordic_asymmetry_pct = nordic?.asymmetryPct ?? null;
  }

  return { phaseKey, matchUnit, recentActual, injuryCategory, gateValues, hasGps, hasForcePlate };
}
