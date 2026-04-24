/**
 * WIMU PRO (Hudl, formerly RealTrack Systems) GPS integration — TYPES.
 *
 * WIMU has no public REST API for third-party tools, so unlike Catapult
 * we ingest via CSV/Excel exports from the SPRO desktop analysis software.
 * The shapes here mirror src/lib/integrations/catapult/types.ts so the
 * downstream pipeline (player_external_load_daily writes, baseline
 * computation, decoupling) doesn't need to know which provider supplied
 * the data — it just sees a NormalizedExternalLoad record.
 */

/**
 * One row as it comes off SPRO's "Export raw data" function. Every value
 * arrives as a string from the CSV — typing happens in normalize.ts.
 *
 * The source CSV typically has 30-100+ columns depending on which export
 * preset the coach used, so we keep this loose and let metricCatalog do
 * alias-based lookup.
 */
export type WimuRawRow = {
  /** Row dictionary as parsed from CSV (column-name → cell value as string) */
  raw: Record<string, string>;
  /** Convenience accessors that we extract early for routing decisions */
  athleteName: string | null;
  date: string | null;          // ISO YYYY-MM-DD
  sessionName?: string | null;  // e.g. "Æfing - Mánudagur"
};

/**
 * One athlete-session worth of typed metrics, one step before we map to
 * a MicroPulse player_id. Closely mirrors CatapultSessionMetric.
 */
export type WimuSessionMetric = {
  athleteName: string;
  date: string;
  sessionName?: string | null;
  durationMinutes?: number | null;

  // Volume
  totalDistance?: number | null;          // m
  highSpeedDistance?: number | null;      // m, > 19.8 km/h zone
  sprintDistance?: number | null;         // m, > 25.2 km/h zone
  hirDistance?: number | null;            // m, "high-intensity running" 14.4-19.8

  // Counts
  accelerations?: number | null;
  decelerations?: number | null;
  sprintCount?: number | null;
  codEvents?: number | null;              // change of direction events

  // Velocity
  maxVelocity?: number | null;            // km/h
  avgVelocity?: number | null;            // km/h

  // Player Load (RealTrack uses "Player Load" as the canonical name, same as Catapult)
  playerLoad?: number | null;
  playerLoadPerMinute?: number | null;

  // Metabolic (WIMU is strong at metabolic metrics — this is their differentiator)
  metabolicPower?: number | null;         // avg W/kg
  metabolicPowerPeak?: number | null;     // peak W/kg
  metabolicLoadScore?: number | null;     // SPRO-specific composite
  highMetabolicLoadDistanceM?: number | null;  // HMLD m
  metabolicEnergyKj?: number | null;

  // Heart rate
  avgHeartRate?: number | null;
  maxHeartRate?: number | null;
  hrZone1TimeS?: number | null;
  hrZone2TimeS?: number | null;
  hrZone3TimeS?: number | null;
  hrZone4TimeS?: number | null;
  hrZone5TimeS?: number | null;
};

/**
 * After we resolve athleteName → MicroPulse player_id, we emit one of these
 * per session. Compatible with what Catapult sync produces — both feed the
 * same player_external_load_daily upsert.
 */
export type NormalizedExternalLoad = {
  playerId: string;
  date: string;
  source: "wimu";
  externalAthleteName: string;
  externalLoad: Omit<WimuSessionMetric, "athleteName" | "date" | "sessionName"> & {
    sessionName?: string | null;
  };
  rawPayload?: unknown;
};

/**
 * Per-team mapping table row. Stored in team_integrations.config (jsonb)
 * so subsequent imports auto-resolve athlete names without re-asking the
 * coach.
 */
export type WimuAthleteMapRecord = {
  wimuAthleteName: string;       // exact case as it appears in CSV exports
  micropulsePlayerId: string;
  matchMethod: "manual" | "exact_name" | "fuzzy_name";
  confidence: number;             // 0..1
};

/**
 * Result returned to the coach UI after an upload is processed.
 */
export type WimuImportResult = {
  fileName: string;
  rowsParsed: number;
  athletesFound: number;
  athletesMatched: number;
  athletesUnmatched: string[];   // names that need manual mapping
  sessionsNormalized: number;
  sessionsStored: number;
  earliestDate: string | null;
  latestDate: string | null;
  warnings: string[];
  errors: string[];
};
