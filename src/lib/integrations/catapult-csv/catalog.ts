/**
 * Catapult OpenField Cloud CSV — column alias catalog.
 *
 * Activity Reports exported from OpenField Cloud (available on every
 * subscription tier) ship as CSV. Column names vary by report template,
 * Catapult firmware version, and the coach's chosen presets, so we use
 * alias-based fuzzy matching rather than pinning to specific names.
 *
 * Aliases here cover:
 *   - Standard Activity Report columns (the default report template)
 *   - Custom Parameter Report columns (Vector S7+ stride / IMA Free Running)
 *   - Period/Drill breakdown columns (when athlete is on a period split)
 *   - Common synonyms across firmware versions (e.g. "PL" vs "Player Load")
 *
 * The downstream pipeline writes to player_external_load_daily, the same
 * table the API-based Catapult integration writes to — so once a row is
 * normalised, McBurnie / Decel Intelligence / Indoor Load all work
 * identically regardless of whether the data came from API or CSV upload.
 */

export type CatapultMetricKey =
  // ── Routing (used to identify the athlete + session) ──
  | "athleteName"
  | "athleteId"
  | "date"
  | "sessionName"
  | "periodName"
  | "position"
  | "durationMinutes"
  | "mdDayLabel"          // OpenField "MD Day" tag (MD-3, MD+1, …) — context only

  // ── Volume ──
  | "totalDistance"
  | "distancePerMinute"
  | "highSpeedDistance"
  | "sprintDistance"
  | "highSpeedEfforts"    // HSR effort count (vel-band 5+)
  | "sprintEfforts"       // Sprint effort count (vel-band 6+) — alias key for clarity vs velocityBand6Efforts

  // ── Velocity bands (0-6) ──
  | "velocityBand1Distance"
  | "velocityBand2Distance"
  | "velocityBand3Distance"
  | "velocityBand4Distance"
  | "velocityBand5Distance"
  | "velocityBand6Distance"
  | "velocityBand6Efforts"

  // ── Player Load ──
  | "playerLoad"
  | "playerLoadPerMinute"

  // ── Acceleration / Deceleration totals + peaks (CSV-only, not via API) ──
  | "totalAccelerations"      // "Tot Accels" → tot_as
  | "totalDecelerations"      // "Tot Decels" → tot_ds
  | "accelB23Efforts"         // "Acceleration B2-3 Total Efforts (Gen 2)" → accel_b2_3_tot_effs_gen2
  | "decelB23Efforts"         // "Deceleration B2-3 Total Efforts (Gen 2)" → decel_b2_3_tot_effs_gen2
  | "accelDecelEfforts"       // "Accel&Decel Efforts" → accel_decel_efforts
  | "maxAcceleration"         // "Max Acceleration" → max_acceleration
  | "maxDeceleration"         // "Max Deceleration" → max_deceleration

  // ── IMA Acceleration (Bands 1-3 — low/med/high) ──
  | "imaAccelBand1"
  | "imaAccelBand2"
  | "imaAccelBand3"

  // ── IMA Deceleration (Bands 1-3) ──
  | "imaDecelBand1"
  | "imaDecelBand2"
  | "imaDecelBand3"

  // ── IMA Free Running (Vector S7+ — stride detection bands 1-8) ──
  | "imaFrBand1Strides" | "imaFrBand2Strides" | "imaFrBand3Strides" | "imaFrBand4Strides"
  | "imaFrBand5Strides" | "imaFrBand6Strides" | "imaFrBand7Strides" | "imaFrBand8Strides"
  | "imaFrBand1Rate"    | "imaFrBand2Rate"    | "imaFrBand3Rate"    | "imaFrBand4Rate"
  | "imaFrBand5Rate"    | "imaFrBand6Rate"    | "imaFrBand7Rate"    | "imaFrBand8Rate"

  // ── IMA Change of Direction Left/Right (Stride Intelligence asymmetry) ──
  | "imaCodLeftHigh"   | "imaCodLeftMedium"   | "imaCodLeftLow"
  | "imaCodRightHigh"  | "imaCodRightMedium"  | "imaCodRightLow"

  // ── Metabolic ──
  | "hmld"             // High Metabolic Load Distance
  | "metabolicPower"
  | "totalMetabolicEnergy"

  // ── Velocity ──
  | "maxVelocity"
  | "avgVelocity"

  // ── Heart rate (frequently absent on GPS-only sessions) ──
  | "avgHeartRate"
  | "maxHeartRate";

export type CatapultMetricDefinition = {
  key: CatapultMetricKey;
  label: string;
  unit?: string;
  aliases: string[];
};

/**
 * Normalize a column header for alias matching.
 * - lowercase
 * - strip parenthesized units "(m)", "(km/h)", "(bpm)"
 * - strip diacritics
 * - strip non-alphanumeric (spaces, dashes, dots, slashes, underscores)
 */
export function normalizeColumnName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

const METRIC_DEFINITIONS: readonly CatapultMetricDefinition[] = [
  // ─── Routing ─────────────────────────────────────────────────────────
  { key: "athleteName", label: "Athlete name",
    aliases: ["athlete name", "athlete", "player", "player name", "name", "full name", "athlete first last"] },
  { key: "athleteId", label: "Athlete ID (Catapult GUID)",
    aliases: ["athlete id", "athlete guid", "player id", "player guid", "athleteid", "guid"] },
  { key: "date", label: "Session date",
    aliases: ["date", "activity date", "date activity", "session date", "day", "start date"] },
  { key: "sessionName", label: "Activity / session name",
    aliases: ["activity name", "activity", "session", "session name"] },
  { key: "periodName", label: "Period / drill name",
    aliases: ["period name", "period", "tag", "drill", "drill name"] },
  { key: "position", label: "Position",
    aliases: ["position", "athlete position", "playing position"] },
  { key: "durationMinutes", label: "Duration (min)", unit: "min",
    aliases: ["duration", "total duration", "session duration", "duration minutes", "duration min", "active time"] },
  { key: "mdDayLabel", label: "MD Day",
    aliases: ["md day", "matchday", "md-day", "md tag", "matchday tag", "md day label"] },

  // ─── Volume ──────────────────────────────────────────────────────────
  { key: "totalDistance", label: "Total Distance", unit: "m",
    aliases: ["total distance", "distance", "distance m", "total distance m", "total dist", "avg dist", "avg distance"] },
  { key: "distancePerMinute", label: "Distance / min", unit: "m/min",
    aliases: ["distance per minute", "distance min", "distance per min", "m per min", "dist per min", "meters per minute"] },
  { key: "highSpeedDistance", label: "High Speed Running", unit: "m",
    aliases: ["high speed running", "hsr", "high speed running m", "hsr distance", "hs distance", "high speed distance"] },
  { key: "sprintDistance", label: "Sprint Distance", unit: "m",
    aliases: ["sprint distance", "sprint dist", "sprint m", "sprinting distance"] },
  // High Speed Efforts (count) — separate from HSR distance
  // (Gen 2) suffix is stripped by normalizeColumnName, so aliases match the post-strip form.
  { key: "highSpeedEfforts", label: "HS Efforts (#)", unit: "count",
    aliases: ["high speed efforts", "hs efforts", "hsr efforts", "hsr effort count",
              "velocity band 5 total efforts", "velocity band 5 total effort count",
              "vel b5 efforts", "vel b5 total efforts"] },
  // Sprint Efforts — explicit alias key (also writes to velocity_band6_total_efforts_gen2)
  { key: "sprintEfforts", label: "Sprint Efforts (#)", unit: "count",
    aliases: ["sprint efforts", "sprint effort count", "sprinting efforts",
              "velocity band 6 total efforts", "velocity band 6 total effort count",
              "vel b6 efforts", "vel b6 total efforts"] },

  // ─── Velocity bands ──────────────────────────────────────────────────
  { key: "velocityBand1Distance", label: "Velocity Band 1 (m)", unit: "m",
    aliases: ["velocity band 1 total distance", "vel band 1 distance", "v band 1 distance", "vb1 distance", "velocity band 1 distance"] },
  { key: "velocityBand2Distance", label: "Velocity Band 2 (m)", unit: "m",
    aliases: ["velocity band 2 total distance", "vel band 2 distance", "v band 2 distance", "vb2 distance", "velocity band 2 distance"] },
  { key: "velocityBand3Distance", label: "Velocity Band 3 (m)", unit: "m",
    aliases: ["velocity band 3 total distance", "vel band 3 distance", "v band 3 distance", "vb3 distance", "velocity band 3 distance"] },
  { key: "velocityBand4Distance", label: "Velocity Band 4 (m)", unit: "m",
    aliases: ["velocity band 4 total distance", "vel band 4 distance", "v band 4 distance", "vb4 distance", "velocity band 4 distance"] },
  { key: "velocityBand5Distance", label: "Velocity Band 5 (m)", unit: "m",
    aliases: ["velocity band 5 total distance", "vel band 5 distance", "v band 5 distance", "vb5 distance", "velocity band 5 distance",
              // OpenField "Velocity B5 Avg Dist (Sess) (m)" — parens are stripped before matching
              "velocity b5 avg dist", "vel b5 avg dist", "velocity band 5 avg dist"] },
  { key: "velocityBand6Distance", label: "Velocity Band 6 (m)", unit: "m",
    aliases: ["velocity band 6 total distance", "vel band 6 distance", "v band 6 distance", "vb6 distance", "velocity band 6 distance", "v6 distance",
              // OpenField "Velocity B6 Avg Dist (Sess) (m)" — parens stripped
              "velocity b6 avg dist", "vel b6 avg dist", "velocity band 6 avg dist"] },
  { key: "velocityBand6Efforts", label: "Velocity Band 6 Effort Count", unit: "count",
    aliases: ["velocity band 6 total effort count", "velocity band 6 effort count", "vel band 6 efforts", "vb6 efforts", "v6 efforts", "velocity band 6 efforts"] },

  // ─── Player Load ─────────────────────────────────────────────────────
  { key: "playerLoad", label: "Player Load",
    aliases: ["player load", "total player load", "pl", "playerload", "player load total"] },
  { key: "playerLoadPerMinute", label: "Player Load / min",
    aliases: ["player load per minute", "player load min", "pl per min", "plpm", "playerloadperminute", "pl min"] },

  // ─── Accel/Decel totals + B2-3 efforts + peaks (CSV-only) ───────────
  // OpenField Activity Report header uses the unqualified "Acceleration
  // Efforts" / "Deceleration Efforts" column names — these are the
  // session-total accel/decel counts and map to tot_as / tot_ds.
  { key: "totalAccelerations", label: "Tot Accels (#)", unit: "count",
    aliases: ["tot accels", "total accels", "total accelerations", "tot as", "tot accelerations",
              "acceleration efforts", "accel efforts"] },
  { key: "totalDecelerations", label: "Tot Decels (#)", unit: "count",
    aliases: ["tot decels", "total decels", "total decelerations", "tot ds", "tot decelerations",
              "deceleration efforts", "decel efforts"] },
  // "(Gen 2)" is stripped by normalizeColumnName (parens removed), so the
  // alias must match the *post-strip* form: "Acceleration B2-3 Total Efforts"
  { key: "accelB23Efforts", label: "Acceleration B2-3 Total Efforts (Gen 2)", unit: "count",
    aliases: ["acceleration b2 3 total efforts", "acceleration b23 total efforts",
              "acceleration b2-3 total efforts",
              "accel b2 3 tot effs gen2", "accel b2 3 efforts", "accel b23 efforts",
              "acceleration band 2 3 total efforts"] },
  { key: "decelB23Efforts", label: "Deceleration B2-3 Total Efforts (Gen 2)", unit: "count",
    aliases: ["deceleration b2 3 total efforts", "deceleration b23 total efforts",
              "deceleration b2-3 total efforts",
              "decel b2 3 tot effs gen2", "decel b2 3 efforts", "decel b23 efforts",
              "deceleration band 2 3 total efforts"] },
  { key: "accelDecelEfforts", label: "Accel & Decel Efforts", unit: "count",
    aliases: ["accel decel efforts", "acceldecel efforts", "accel and decel efforts",
              "accel & decel efforts", "acceleration deceleration efforts"] },
  { key: "maxAcceleration", label: "Max Acceleration", unit: "m/s²",
    aliases: ["max acceleration", "maximum acceleration", "peak acceleration", "max accel"] },
  { key: "maxDeceleration", label: "Max Deceleration", unit: "m/s²",
    aliases: ["max deceleration", "maximum deceleration", "peak deceleration", "max decel"] },

  // ─── IMA Accel/Decel (Bands 1-3) ─────────────────────────────────────
  { key: "imaAccelBand1", label: "IMA Accel Band 1", unit: "count",
    aliases: ["ima acceleration band 1 count", "ima acceleration low band count", "ima accel band 1", "accel band 1 count"] },
  { key: "imaAccelBand2", label: "IMA Accel Band 2", unit: "count",
    aliases: ["ima acceleration band 2 count", "ima acceleration medium band count", "ima accel band 2", "accel band 2 count"] },
  { key: "imaAccelBand3", label: "IMA Accel Band 3", unit: "count",
    aliases: ["ima acceleration band 3 count", "ima acceleration high band count", "ima accel band 3", "accel band 3 count"] },
  { key: "imaDecelBand1", label: "IMA Decel Band 1", unit: "count",
    aliases: ["ima deceleration band 1 count", "ima deceleration low band count", "ima decel band 1", "decel band 1 count"] },
  { key: "imaDecelBand2", label: "IMA Decel Band 2", unit: "count",
    aliases: ["ima deceleration band 2 count", "ima deceleration medium band count", "ima decel band 2", "decel band 2 count"] },
  { key: "imaDecelBand3", label: "IMA Decel Band 3", unit: "count",
    aliases: ["ima deceleration band 3 count", "ima deceleration high band count", "ima decel band 3", "decel band 3 count"] },

  // ─── IMA Free Running stride bands 1-8 (Vector S7+) ──────────────────
  // Stride counts
  { key: "imaFrBand1Strides", label: "IMA FR Band 1 Strides", unit: "count",
    aliases: ["ima free running band 1 total strides", "ima free run band 1 count", "ima free running band 1 count", "imafreerunning band 1 event count"] },
  { key: "imaFrBand2Strides", label: "IMA FR Band 2 Strides", unit: "count",
    aliases: ["ima free running band 2 total strides", "ima free run band 2 count", "ima free running band 2 count", "imafreerunning band 2 event count"] },
  { key: "imaFrBand3Strides", label: "IMA FR Band 3 Strides", unit: "count",
    aliases: ["ima free running band 3 total strides", "ima free run band 3 count", "ima free running band 3 count", "imafreerunning band 3 event count"] },
  { key: "imaFrBand4Strides", label: "IMA FR Band 4 Strides", unit: "count",
    aliases: ["ima free running band 4 total strides", "ima free run band 4 count", "ima free running band 4 count", "imafreerunning band 4 event count"] },
  { key: "imaFrBand5Strides", label: "IMA FR Band 5 Strides", unit: "count",
    aliases: ["ima free running band 5 total strides", "ima free run band 5 count", "ima free running band 5 count", "imafreerunning band 5 event count"] },
  { key: "imaFrBand6Strides", label: "IMA FR Band 6 Strides", unit: "count",
    aliases: ["ima free running band 6 total strides", "ima free run band 6 count", "ima free running band 6 count", "imafreerunning band 6 event count"] },
  { key: "imaFrBand7Strides", label: "IMA FR Band 7 Strides", unit: "count",
    aliases: ["ima free running band 7 total strides", "ima free run band 7 count", "ima free running band 7 count", "imafreerunning band 7 event count"] },
  { key: "imaFrBand8Strides", label: "IMA FR Band 8 Strides", unit: "count",
    aliases: ["ima free running band 8 total strides", "ima free run band 8 count", "ima free running band 8 count", "imafreerunning band 8 event count"] },
  // Stride rates
  { key: "imaFrBand1Rate", label: "IMA FR Band 1 Stride Rate", unit: "/s",
    aliases: ["ima free running band 1 average stride rate", "ima free run band 1 rate", "imafreerunning band 1 average stride rate"] },
  { key: "imaFrBand2Rate", label: "IMA FR Band 2 Stride Rate", unit: "/s",
    aliases: ["ima free running band 2 average stride rate", "ima free run band 2 rate", "imafreerunning band 2 average stride rate"] },
  { key: "imaFrBand3Rate", label: "IMA FR Band 3 Stride Rate", unit: "/s",
    aliases: ["ima free running band 3 average stride rate", "ima free run band 3 rate", "imafreerunning band 3 average stride rate"] },
  { key: "imaFrBand4Rate", label: "IMA FR Band 4 Stride Rate", unit: "/s",
    aliases: ["ima free running band 4 average stride rate", "ima free run band 4 rate", "imafreerunning band 4 average stride rate"] },
  { key: "imaFrBand5Rate", label: "IMA FR Band 5 Stride Rate", unit: "/s",
    aliases: ["ima free running band 5 average stride rate", "ima free run band 5 rate", "imafreerunning band 5 average stride rate"] },
  { key: "imaFrBand6Rate", label: "IMA FR Band 6 Stride Rate", unit: "/s",
    aliases: ["ima free running band 6 average stride rate", "ima free run band 6 rate", "imafreerunning band 6 average stride rate"] },
  { key: "imaFrBand7Rate", label: "IMA FR Band 7 Stride Rate", unit: "/s",
    aliases: ["ima free running band 7 average stride rate", "ima free run band 7 rate", "imafreerunning band 7 average stride rate"] },
  { key: "imaFrBand8Rate", label: "IMA FR Band 8 Stride Rate", unit: "/s",
    aliases: ["ima free running band 8 average stride rate", "ima free run band 8 rate", "imafreerunning band 8 average stride rate"] },

  // ─── IMA Change of Direction L/R splits (Stride Intelligence asymmetry) ───
  // Catapult exports CoD as Left/Right × Low/Medium/High. Sum sides to compute
  // |L-R|/((L+R)/2)*100 asymmetry index. >15% = injury-risk flag (Bishop 2020).
  { key: "imaCodLeftHigh", label: "IMA CoD Left High", unit: "count",
    aliases: ["ima cod left high", "ima cod left high count", "ima change of direction left high"] },
  { key: "imaCodLeftMedium", label: "IMA CoD Left Medium", unit: "count",
    aliases: ["ima cod left medium", "ima cod left medium count", "ima change of direction left medium"] },
  { key: "imaCodLeftLow", label: "IMA CoD Left Low", unit: "count",
    aliases: ["ima cod left low", "ima cod left low count", "ima change of direction left low"] },
  { key: "imaCodRightHigh", label: "IMA CoD Right High", unit: "count",
    aliases: ["ima cod right high", "ima cod right high count", "ima change of direction right high"] },
  { key: "imaCodRightMedium", label: "IMA CoD Right Medium", unit: "count",
    aliases: ["ima cod right medium", "ima cod right medium count", "ima change of direction right medium"] },
  { key: "imaCodRightLow", label: "IMA CoD Right Low", unit: "count",
    aliases: ["ima cod right low", "ima cod right low count", "ima change of direction right low"] },

  // ─── Metabolic ───────────────────────────────────────────────────────
  { key: "hmld", label: "High Metabolic Load Distance", unit: "m",
    aliases: ["high metabolic load distance", "hmld", "high metabolic load distance m"] },
  { key: "metabolicPower", label: "Avg Metabolic Power", unit: "W/kg",
    aliases: ["average metabolic power", "avg metabolic power", "metabolic power", "metabolic power avg"] },
  { key: "totalMetabolicEnergy", label: "Total Metabolic Energy", unit: "kJ",
    aliases: ["total metabolic energy", "metabolic energy", "energy expenditure"] },

  // ─── Velocity ────────────────────────────────────────────────────────
  { key: "maxVelocity", label: "Max Velocity",
    aliases: ["max velocity", "maximum velocity", "top speed", "peak velocity", "max speed", "max velocity ms"] },
  { key: "avgVelocity", label: "Average Velocity",
    aliases: ["average velocity", "avg velocity", "average speed", "avg speed", "mean velocity"] },

  // ─── Heart rate ──────────────────────────────────────────────────────
  { key: "avgHeartRate", label: "Avg HR", unit: "bpm",
    aliases: ["average heart rate", "avg heart rate", "heart rate avg", "average hr", "avg hr"] },
  { key: "maxHeartRate", label: "Max HR", unit: "bpm",
    aliases: ["maximum heart rate", "max heart rate", "heart rate max", "maximum hr", "max hr"] },
];

/**
 * Build a normalized-alias → metric-key lookup map.
 */
export function buildHeaderAliasIndex(): Map<string, CatapultMetricKey> {
  const m = new Map<string, CatapultMetricKey>();
  for (const def of METRIC_DEFINITIONS) {
    for (const alias of def.aliases) {
      m.set(normalizeColumnName(alias), def.key);
    }
    // Also accept the canonical key name itself as an alias
    m.set(normalizeColumnName(def.key), def.key);
  }
  return m;
}

export function matchHeader(
  rawHeader: string,
  index?: Map<string, CatapultMetricKey>,
): CatapultMetricKey | null {
  const idx = index ?? buildHeaderAliasIndex();
  return idx.get(normalizeColumnName(rawHeader)) ?? null;
}

export function listMetricDefinitions(): readonly CatapultMetricDefinition[] {
  return METRIC_DEFINITIONS;
}
