/**
 * Internal:External load decoupling (Halson 2014).
 *
 * The same external load (distance, player-load) achieved at higher
 * internal cost (RPE × duration, HR) is the classic early-warning
 * signal of cumulative fatigue, sub-clinical illness, or under-recovery.
 *
 * This module computes per-session decoupling ratios and compares them
 * against the athlete's personal baseline (refreshed nightly into
 * athlete_metric_baselines via the SQL function).
 *
 * Two ratios are tracked:
 *   - rpe_per_km     = (RPE × duration_min) / distance_km
 *   - hr_per_pl      = avg_HR / player_load
 *
 * A flag is raised when the ratio exceeds +1 SD above the athlete's
 * personal baseline (yellow) or +2 SD (red). Drift in the upward
 * direction = more cost per unit of work = fatigued.
 */

import {
  flagAgainstBaseline,
  type AthleteMetricBaseline,
  type SdBandFlag,
} from "../baselines";

export type SessionInputs = {
  rpe: number | null;
  durationMinutes: number | null;
  totalDistanceMetres: number | null;
  avgHeartRate: number | null;
  playerLoad: number | null;
};

export type DecouplingResult = {
  rpePerKm: number | null;
  hrPerPlayerLoad: number | null;
  rpeFlag: SdBandFlag;
  hrFlag: SdBandFlag;
  /** SD distance from baseline; positive = more cost than usual = worse */
  rpeZ: number | null;
  hrZ: number | null;
  /** Worst flag of the two ratios — useful as a single contextual signal */
  worstFlag: SdBandFlag;
  /** Human-readable reasoning, surfaced in coach explanation panel */
  reason: string;
};

/**
 * Compute decoupling ratios for one session.
 * Returns null ratios where required inputs are missing.
 */
export function computeSessionDecoupling(s: SessionInputs): {
  rpePerKm: number | null;
  hrPerPlayerLoad: number | null;
} {
  const distanceKm = s.totalDistanceMetres != null && s.totalDistanceMetres > 0
    ? s.totalDistanceMetres / 1000
    : null;

  const dur = s.durationMinutes ?? 60;
  const rpePerKm =
    s.rpe != null && distanceKm != null && distanceKm > 0
      ? (s.rpe * dur) / distanceKm
      : null;

  const hrPerPlayerLoad =
    s.avgHeartRate != null && s.playerLoad != null && s.playerLoad > 0
      ? s.avgHeartRate / s.playerLoad
      : null;

  return { rpePerKm, hrPerPlayerLoad };
}

/**
 * Worst-of-two combinator. Used to surface a single decoupling flag.
 * Order matters: red > yellow > green.
 */
function worse(a: SdBandFlag, b: SdBandFlag): SdBandFlag {
  if (a === "red" || b === "red") return "red";
  if (a === "yellow" || b === "yellow") return "yellow";
  return "green";
}

/**
 * Flag today's decoupling against the athlete's personal baselines.
 *
 * Decoupling is a "higher_is_worse" signal — more internal cost per
 * unit of external work means the athlete is paying more biologically
 * for the same work. The flag direction is therefore positive-Z = bad.
 */
export function flagDecoupling(
  inputs: SessionInputs,
  baselines: {
    rpePerKm: AthleteMetricBaseline | null;
    hrPerPlayerLoad: AthleteMetricBaseline | null;
  },
): DecouplingResult {
  const { rpePerKm, hrPerPlayerLoad } = computeSessionDecoupling(inputs);

  const rpeFlagged = rpePerKm != null
    ? flagAgainstBaseline(rpePerKm, baselines.rpePerKm, "decoupling.rpe_per_km")
    : { z: null, flag: "green" as SdBandFlag, reason: "no_data" };

  const hrFlagged = hrPerPlayerLoad != null
    ? flagAgainstBaseline(hrPerPlayerLoad, baselines.hrPerPlayerLoad, "decoupling.hr_per_player_load")
    : { z: null, flag: "green" as SdBandFlag, reason: "no_data" };

  const worstFlag = worse(rpeFlagged.flag, hrFlagged.flag);

  const reasons: string[] = [];
  if (rpeFlagged.flag !== "green") {
    reasons.push(
      `RPE-per-km drifted ${rpeFlagged.z != null ? `${rpeFlagged.z.toFixed(1)} SD` : "above"} baseline`,
    );
  }
  if (hrFlagged.flag !== "green") {
    reasons.push(
      `HR-per-PlayerLoad drifted ${hrFlagged.z != null ? `${hrFlagged.z.toFixed(1)} SD` : "above"} baseline`,
    );
  }

  return {
    rpePerKm: rpePerKm != null ? Math.round(rpePerKm * 100) / 100 : null,
    hrPerPlayerLoad: hrPerPlayerLoad != null ? Math.round(hrPerPlayerLoad * 100) / 100 : null,
    rpeFlag: rpeFlagged.flag,
    hrFlag: hrFlagged.flag,
    rpeZ: rpeFlagged.z,
    hrZ: hrFlagged.z,
    worstFlag,
    reason:
      reasons.length === 0
        ? "Same internal cost as usual for this external load."
        : reasons.join(" · "),
  };
}
