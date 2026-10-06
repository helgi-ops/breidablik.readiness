/**
 * Titan row → player_external_load_daily upsert shape (pure).
 *
 * Writes the three indoor IMU load KPIs that have homes in the shared table — player_load
 * (anchor, also mirrored to total_player_load), jumps, impacts — plus session_duration_minutes
 * and a recomputed player_load_per_minute. GPS metrics are left null (indoor, IMU-only; `total_distance`
 * is written as an explicit null so a re-upsert can never leave a stale distance). The full Titan row
 * (incl. low/high active durations) is preserved in raw_payload_json.
 *
 * source="titan" — the same table Catapult/WIMU/manual write to, so the readiness/load engine (which
 * reads the table source-agnostically and dedupes one row per date) treats it exactly like any other
 * indoor load source. Dedupe/upsert key everywhere is (player_id, date, source).
 *
 * Descriptive — never writes a readiness colour or the daily decision.
 */

import type { TitanRow } from "./parseSyncedData";

export interface TitanExternalLoadRow {
  player_id: string;
  team_id: string;
  date: string;
  source: "titan";
  external_athlete_id: string;
  activity_count: number;
  player_load: number | null;
  total_player_load: number | null;
  player_load_per_minute: number | null;
  session_duration_minutes: number | null;
  jumps: number | null;
  impacts: number | null;
  /** Explicit null: Titan is indoor IMU-only (no GPS). Kept so an upsert overwrites any stale value. */
  total_distance: null;
  raw_payload_json: unknown;
}

const intOrNull = (v: number | null): number | null => (v == null ? null : Math.round(v));

/**
 * Map one parsed Titan row to an upsert row. Returns null when the row cannot be keyed
 * (no date) — the caller skips those. playerId must already be resolved on the coach's own team.
 */
export function titanRowToExternalLoad(r: TitanRow, playerId: string, teamId: string): TitanExternalLoadRow | null {
  if (!r.date) return null;
  const perMin = r.loadPerMinute ?? (r.imuPlayerLoad != null && r.imuDurationMin && r.imuDurationMin > 0
    ? Number((r.imuPlayerLoad / r.imuDurationMin).toFixed(3))
    : null);
  return {
    player_id: playerId,
    team_id: teamId,
    date: r.date,
    source: "titan",
    external_athlete_id: r.playerName,
    activity_count: 1,
    player_load: r.imuPlayerLoad,
    total_player_load: r.imuPlayerLoad,
    player_load_per_minute: perMin,
    session_duration_minutes: r.imuDurationMin,
    jumps: intOrNull(r.imuJumps),
    impacts: intOrNull(r.impacts),
    total_distance: null,
    // Keep the full parsed row (incl. low/high active durations + the sheet's Load/Minute) for audit.
    raw_payload_json: { provider: "titan", ...r },
  };
}
