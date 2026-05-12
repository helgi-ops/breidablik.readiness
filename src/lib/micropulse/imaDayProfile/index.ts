/**
 * IMA Day Profile — biomechanical view of a single training day.
 *
 * Where Decel Intelligence answers "is this player chronically at risk?"
 * and Load Intelligence answers "did the team train hard enough?", this
 * module answers a third question that's been missing from the system:
 *
 *   "What did today's session actually deliver, biomechanically?"
 *
 * The answer matters because two players doing the same nominal session
 * can walk away with very different IMU profiles. A possession-heavy day
 * with rondos loads up bands 5-8 (quick-cadence work) without producing
 * GPS sprint distance. A linear running day inverts that. Coaches who
 * only look at GPS miss this — and miss the planning errors that follow
 * ("we said MD-3 high-cadence but we delivered MD-2 tempo work").
 *
 * Sport-science rationale:
 *   - Catapult IMA Free Running V2 buckets each detected stride by the
 *     IMU-derived velocity at that step. Bands 5-8 (18+ km/h equivalent)
 *     capture high-cadence work that's hamstring-relevant regardless of
 *     whether the player travelled forward at sprint speed.
 *   - McBurnie 2022: stride distribution forecasts hamstring/quad injury
 *     better than GPS velocity bands alone.
 *   - Bishop 2020: L/R asymmetry > 15% in high-intensity CoD efforts
 *     is the strongest single predictor of non-contact lower-limb injury.
 *   - Buchheit 2014: stride norms are individual; per-player baseline
 *     comparison is required for meaningful interpretation.
 *
 * Pure deterministic. Loader.ts pulls rows from player_external_load_daily
 * and reshapes them into team + per-player day profiles.
 *
 * References:
 *   - McBurnie AJ et al. Deceleration training in team sports.
 *     Sports Med 2022;52:1473-1487.
 *   - Bishop C et al. The association between inter-limb asymmetry and
 *     injury risk in soccer players. J Athl Train 2020;55:1062-1070.
 *   - Buchheit M et al. Integrating different tracking systems in
 *     football. J Sports Sci 2014;32(20):1844-1857.
 */

export type SessionType =
  | "high_cadence"   // > 30% of strides in bands 5-8 (sprint-heavy)
  | "tactical"       // > 60% of strides in bands 1-3 (low-intensity)
  | "mixed"          // balanced distribution
  | "recovery"       // < 1500 total strides (light day / off)
  | "no_data";

export type ImaPlayerDay = {
  player_id: string;
  full_name: string;
  source: string | null;
  /** Total IMA strides bands 1-8 captured that day. */
  total_strides: number;
  /** Sum of bands 1-3 (walking → medium running). */
  low_strides: number;
  /** Sum of bands 4-6 (fast running → high-speed running). */
  mid_strides: number;
  /** Sum of bands 7-8 (sprint → max sprint). */
  high_strides: number;
  /** Bands 5-8 (the Sprint Exposure unit). */
  sprint_strides: number;
  /** Personal 14-day training-only avg of bands 5-8 — null if no baseline. */
  sprint_baseline_avg: number | null;
  /** Today's bands 5-8 ÷ baseline × 100. null if no baseline. */
  sprint_vs_baseline_pct: number | null;
  // Change of Direction — three-tier breakdown (low / medium / high).
  // High-intensity asymmetry is the injury-relevant tier (Bishop 2020:
  // > 15% asymmetry = 3× non-contact injury risk). Low/medium asymmetry
  // is often a positional habit and less actionable.
  cod_left_low: number;
  cod_right_low: number;
  cod_left_medium: number;
  cod_right_medium: number;
  cod_left_high: number;
  cod_right_high: number;
  /** Total of all 6 cells (L+R across all 3 tiers). */
  cod_total: number;
  /** Total high-intensity only (L+R). */
  cod_total_high: number;
  /** L/R asymmetry % on low-intensity CoD — null when low total < 10. */
  cod_asymmetry_low_pct: number | null;
  /** L/R asymmetry % on medium-intensity CoD — null when total < 10. */
  cod_asymmetry_medium_pct: number | null;
  /** L/R asymmetry % on high-intensity CoD — null when total < 10. The
   *  injury-relevant tier per Bishop 2020. */
  cod_asymmetry_pct: number | null;
};

export type ImaSessionProfile = {
  date: string;
  team_id: string;
  /** Number of players with non-zero IMA data captured that day. */
  player_count: number;
  team_total_strides: number;
  team_low_strides: number;
  team_mid_strides: number;
  team_high_strides: number;
  team_sprint_strides: number;
  /** Pct of strides in bands 1-3 (low). */
  pct_low: number;
  /** Pct of strides in bands 4-6 (mid). */
  pct_mid: number;
  /** Pct of strides in bands 7-8 (high). */
  pct_high: number;
  /** Pct of strides in bands 5-8 (sprint-relevant). */
  pct_sprint: number;
  // Team-level CoD per-tier totals (L + R for each tier)
  team_cod_low_left: number;
  team_cod_low_right: number;
  team_cod_medium_left: number;
  team_cod_medium_right: number;
  team_cod_high_left: number;
  team_cod_high_right: number;
  /** Sum of all CoD efforts (all tiers, both sides). */
  team_cod_total: number;
  /** Legacy alias: team-level high-tier L+R total. */
  team_cod_left: number;
  team_cod_right: number;
  /** Team-level L/R asymmetry per tier — null when tier total < 20. */
  team_cod_asymmetry_low_pct: number | null;
  team_cod_asymmetry_medium_pct: number | null;
  team_cod_asymmetry_pct: number | null;
  /** Number of players whose high-tier CoD asymmetry exceeds 15%. */
  players_high_cod_flagged: number;
  /** High-level classification of the session shape. */
  session_type: SessionType;
  /** Plain-language headline for the session. */
  session_headline: string;
  per_player: ImaPlayerDay[];
};

/** Asymmetry % using Bishop 2020 formula: |L-R| ÷ max(L,R) × 100. */
export function asymmetryPct(left: number, right: number): number | null {
  const max = Math.max(left, right);
  if (max <= 0) return null;
  return Math.abs(left - right) / max * 100;
}

/** Classify a session by the distribution of its strides across band tiers.
 *
 *  Thresholds tuned against Breiðablik historical data (May 2026):
 *    - Recovery: total strides < 1500 (light day / DNP / morning-only)
 *    - High-cadence: sprint band (5-8) > 30% of total
 *    - Tactical: low band (1-3) > 65% AND sprint < 15% (rondo-heavy)
 *    - Mixed: everything else (typical MD-2/MD-3 mixed session)
 */
export function classifySession(
  totalStrides: number,
  pctLow: number,
  pctSprint: number,
): SessionType {
  if (totalStrides < 1500) return "recovery";
  if (pctSprint > 30) return "high_cadence";
  if (pctLow > 65 && pctSprint < 15) return "tactical";
  return "mixed";
}

/** Coach-facing one-liner for the session card header. */
export function sessionHeadline(type: SessionType, lang: "IS" | "EN" = "EN"): string {
  if (lang === "IS") {
    switch (type) {
      case "high_cadence": return "Hraðasta æfingin — mikið af spretta/COD vinnu";
      case "tactical": return "Tæknileg æfing — yfirgnæfandi low-intensity";
      case "mixed": return "Blönduð æfing — eðlilegt MD-2/MD-3 dreifing";
      case "recovery": return "Endurheimt eða stuttur dagur";
      case "no_data": return "Engin IMA gögn fyrir þennan dag";
    }
  }
  switch (type) {
    case "high_cadence": return "High-cadence day — lots of sprint / COD work";
    case "tactical": return "Tactical day — predominantly low-intensity";
    case "mixed": return "Mixed day — typical MD-2/MD-3 distribution";
    case "recovery": return "Recovery or short session";
    case "no_data": return "No IMA data for this day";
  }
}

/** Build the team-level aggregate from per-player rows. */
export function aggregateTeamProfile(
  perPlayer: ImaPlayerDay[],
  teamId: string,
  date: string,
  lang: "IS" | "EN" = "EN",
): ImaSessionProfile {
  const withData = perPlayer.filter(p => p.total_strides > 0);
  const team_total_strides = withData.reduce((s, p) => s + p.total_strides, 0);
  const team_low_strides = withData.reduce((s, p) => s + p.low_strides, 0);
  const team_mid_strides = withData.reduce((s, p) => s + p.mid_strides, 0);
  const team_high_strides = withData.reduce((s, p) => s + p.high_strides, 0);
  const team_sprint_strides = withData.reduce((s, p) => s + p.sprint_strides, 0);
  const team_cod_low_left = withData.reduce((s, p) => s + p.cod_left_low, 0);
  const team_cod_low_right = withData.reduce((s, p) => s + p.cod_right_low, 0);
  const team_cod_medium_left = withData.reduce((s, p) => s + p.cod_left_medium, 0);
  const team_cod_medium_right = withData.reduce((s, p) => s + p.cod_right_medium, 0);
  const team_cod_high_left = withData.reduce((s, p) => s + p.cod_left_high, 0);
  const team_cod_high_right = withData.reduce((s, p) => s + p.cod_right_high, 0);
  const team_cod_left = team_cod_high_left; // legacy alias for high-tier
  const team_cod_right = team_cod_high_right;
  const team_cod_total =
    team_cod_low_left + team_cod_low_right +
    team_cod_medium_left + team_cod_medium_right +
    team_cod_high_left + team_cod_high_right;
  const team_cod_asymmetry_low_pct = (team_cod_low_left + team_cod_low_right) >= 20
    ? asymmetryPct(team_cod_low_left, team_cod_low_right) : null;
  const team_cod_asymmetry_medium_pct = (team_cod_medium_left + team_cod_medium_right) >= 20
    ? asymmetryPct(team_cod_medium_left, team_cod_medium_right) : null;
  const team_cod_asymmetry_pct = (team_cod_high_left + team_cod_high_right) >= 20
    ? asymmetryPct(team_cod_high_left, team_cod_high_right) : null;
  const players_high_cod_flagged = withData.filter(p =>
    p.cod_asymmetry_pct != null && p.cod_asymmetry_pct > 15,
  ).length;

  const denom = team_total_strides || 1;
  const pct_low = team_low_strides / denom * 100;
  const pct_mid = team_mid_strides / denom * 100;
  const pct_high = team_high_strides / denom * 100;
  const pct_sprint = team_sprint_strides / denom * 100;

  const session_type = withData.length === 0
    ? "no_data"
    : classifySession(
        team_total_strides / withData.length, // avg per player
        pct_low,
        pct_sprint,
      );

  return {
    date, team_id: teamId,
    player_count: withData.length,
    team_total_strides, team_low_strides, team_mid_strides, team_high_strides,
    team_sprint_strides,
    pct_low, pct_mid, pct_high, pct_sprint,
    team_cod_low_left, team_cod_low_right,
    team_cod_medium_left, team_cod_medium_right,
    team_cod_high_left, team_cod_high_right,
    team_cod_total, team_cod_left, team_cod_right,
    team_cod_asymmetry_low_pct, team_cod_asymmetry_medium_pct, team_cod_asymmetry_pct,
    players_high_cod_flagged,
    session_type,
    session_headline: sessionHeadline(session_type, lang),
    per_player: perPlayer,
  };
}
