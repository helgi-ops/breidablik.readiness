/**
 * RPE Discrepancy Analysis
 *
 * Detects meaningful mismatches between a player's reported effort (RPE)
 * and two reference signals:
 *
 *   1. Team median RPE — "Did this player experience the session very
 *      differently from teammates?" A player reporting 3/10 when the
 *      team median is 8/10 is a strong signal worth surfacing.
 *
 *   2. GPS-expected RPE — "Does the reported effort match what the GPS
 *      load would predict?" High GPS burden + low RPE may indicate
 *      underreporting fatigue. Low GPS burden + high RPE may indicate
 *      psychological stress or a session that felt harder than it was.
 *
 * Neither discrepancy is treated as a hard red flag on its own — both
 * are monitoring signals for the coach. They appear as badges and
 * explanation lines, not as state-changing inputs to buildAthleteDecision.
 *
 * Minimum sample requirement: at least 4 teammates must have submitted
 * RPE before the team comparison is meaningful.
 */

export type RpeDiscrepancyFlag =
  | "underreport_vs_team"   // player far below team median
  | "overreport_vs_team"    // player far above team median
  | "underreport_vs_gps"    // GPS burden much higher than reported RPE
  | "overreport_vs_gps";    // reported RPE much higher than GPS burden

export type RpeDiscrepancyLevel = "none" | "notable" | "significant";

export type RpeDiscrepancyResult = {
  level: RpeDiscrepancyLevel;
  flags: RpeDiscrepancyFlag[];
  /** Player RPE − team median (negative = lower than team) */
  teamDelta: number | null;
  /** GPS-expected RPE − player RPE (positive = GPS says harder than reported) */
  gpsDelta: number | null;
  /** Short summary for explanation lines */
  summary: string | null;
};

export type RpeDiscrepancyInput = {
  /** The player's RPE for today (1–10). Null if not submitted. */
  playerRpe: number | null;
  /**
   * RPE values submitted by OTHER players on the same team for the same
   * session date. Excludes the current player and imputed values.
   */
  teamRpeValues: number[];
  /**
   * GPS neuromuscular burden score (0–1) for the player today.
   * Null if GPS data is unavailable or quality is insufficient.
   */
  neuromuscularBurdenScore: number | null;
  /**
   * Categorical GPS load state for additional context.
   */
  externalLoadState: "normal" | "elevated" | "high" | "unknown";
};

/** Minimum teammates required for team comparison to be meaningful */
const MIN_TEAM_SAMPLES = 4;

/** Delta thresholds for team comparison */
const TEAM_NOTABLE_THRESHOLD = 2.0;    // > 2 RPE points from median
const TEAM_SIGNIFICANT_THRESHOLD = 3.5; // > 3.5 points — very different experience

/** Delta thresholds for GPS comparison */
const GPS_NOTABLE_THRESHOLD = 2.0;
const GPS_SIGNIFICANT_THRESHOLD = 3.5;

/**
 * Map GPS neuromuscular burden (0–1) to expected RPE (1–10).
 *
 * Calibrated against typical session profiles:
 *   0.00 → ~3.5  (recovery/technical — very little mechanical stress)
 *   0.20 → ~5.0  (moderate session)
 *   0.50 → ~6.5  (high session)
 *   0.80 → ~8.0  (very high)
 *   1.00 → ~9.0  (maximal — approaching match intensity)
 *
 * Note: GPS cannot predict RPE precisely. The function is intentionally
 * conservative — only large deltas (>2) trigger flags.
 */
function gpsToExpectedRpe(
  burdenScore: number,
  externalLoadState: RpeDiscrepancyInput["externalLoadState"]
): number {
  // Use externalLoadState as a floor to avoid GPS-only sessions being
  // mapped too low when neuromuscular score is partial.
  const stateFloor =
    externalLoadState === "high" ? 0.55
    : externalLoadState === "elevated" ? 0.30
    : 0.0;

  const effectiveBurden = Math.max(burdenScore, stateFloor);
  return Math.round((3.5 + effectiveBurden * 5.5) * 10) / 10;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export function computeRpeDiscrepancy(
  input: RpeDiscrepancyInput
): RpeDiscrepancyResult {
  const none: RpeDiscrepancyResult = {
    level: "none", flags: [], teamDelta: null, gpsDelta: null, summary: null,
  };

  if (input.playerRpe == null) return none;

  const flags: RpeDiscrepancyFlag[] = [];
  let teamDelta: number | null = null;
  let gpsDelta: number | null = null;

  // --- Team comparison ---
  if (input.teamRpeValues.length >= MIN_TEAM_SAMPLES) {
    const teamMedian = median(input.teamRpeValues);
    teamDelta = Math.round((input.playerRpe - teamMedian) * 10) / 10;

    if (teamDelta <= -TEAM_NOTABLE_THRESHOLD) flags.push("underreport_vs_team");
    else if (teamDelta >= TEAM_NOTABLE_THRESHOLD) flags.push("overreport_vs_team");
  }

  // --- GPS comparison ---
  if (
    input.neuromuscularBurdenScore != null &&
    input.externalLoadState !== "unknown" &&
    Number.isFinite(input.neuromuscularBurdenScore)
  ) {
    const expectedRpe = gpsToExpectedRpe(
      input.neuromuscularBurdenScore,
      input.externalLoadState
    );
    gpsDelta = Math.round((expectedRpe - input.playerRpe) * 10) / 10;

    if (gpsDelta >= GPS_NOTABLE_THRESHOLD) flags.push("underreport_vs_gps");
    else if (gpsDelta <= -GPS_NOTABLE_THRESHOLD) flags.push("overreport_vs_gps");
  }

  if (!flags.length) return { ...none, teamDelta, gpsDelta };

  // --- Severity ---
  const teamSignificant =
    teamDelta != null && Math.abs(teamDelta) >= TEAM_SIGNIFICANT_THRESHOLD;
  const gpsSignificant =
    gpsDelta != null && Math.abs(gpsDelta) >= GPS_SIGNIFICANT_THRESHOLD;

  const level: RpeDiscrepancyLevel =
    teamSignificant || gpsSignificant ? "significant" : "notable";

  // --- Summary ---
  const parts: string[] = [];
  if (teamDelta != null && flags.some((f) => f.includes("_vs_team"))) {
    const dir = teamDelta < 0 ? "below" : "above";
    parts.push(`RPE ${Math.abs(teamDelta).toFixed(1)} pts ${dir} team median`);
  }
  if (gpsDelta != null && flags.some((f) => f.includes("_vs_gps"))) {
    const dir = gpsDelta > 0 ? "lower than GPS predicts" : "higher than GPS predicts";
    parts.push(`Reported effort ${dir} (Δ ${Math.abs(gpsDelta).toFixed(1)})`);
  }

  return {
    level,
    flags,
    teamDelta,
    gpsDelta,
    summary: parts.join(" · ") || null,
  };
}
