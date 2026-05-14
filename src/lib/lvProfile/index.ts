/**
 * Load-Velocity Profiling — core math
 *
 * Implements the regression that drives a load-velocity profile from a
 * 3–5-point ramp test (e.g., squat-jump or bench-press loads with mean
 * concentric velocity). Mirrors the Excel reference (Load-Velocity Profile
 * Demo.xlsx) used by S&C coaches.
 *
 * Reference:
 *   González-Badillo & Sánchez-Medina (2010) "Movement velocity as a
 *   measure of loading intensity in resistance training", IJSM 31(5):347–352.
 *   Banyard et al. (2017) "Reliability and validity of the load-velocity
 *   relationship to predict the 1RM in back squat", J Strength Cond Res.
 *
 * Key outputs:
 *   • slope, intercept, SEE, r²
 *   • Y-offset:  predicted velocity at load = 0       (theoretical max V)
 *   • X-offset:  load at velocity = MVT               (predicted 1RM)
 *   • 0-V load:  load at velocity = 0                 (zero-velocity load)
 *   • SEE band:  ±SEE around the 1RM estimate
 *   • Athlete profile: velocity-dominant vs strength-dominant vs balanced
 *
 * MVT = minimum velocity threshold for each lift. Used to define the
 * "1RM end" of the load-velocity line. Defaults from the literature:
 *   bench press   = 0.15 m/s
 *   trap-bar DL   = 0.18 m/s
 *   back squat    = 0.30 m/s
 *   squat jump    = 1.30 m/s  (ballistic, no eccentric pause)
 */

export type LvExerciseKey =
  | "squat_jump"
  | "bench_press"
  | "back_squat"
  | "trap_bar_deadlift"
  | "deadlift"
  | "custom";

export interface LvExerciseSpec {
  key: LvExerciseKey;
  label: string;
  mvt: number;          // minimum velocity threshold, m/s
  type: "strength" | "ballistic";
  // Recommended load range (% bodyweight or absolute) — informational
  loadRangeHint?: string;
}

export const LV_EXERCISES: Record<LvExerciseKey, LvExerciseSpec> = {
  squat_jump:        { key: "squat_jump",        label: "Squat jump",        mvt: 1.30, type: "ballistic", loadRangeHint: "Bodyweight + 25–75 kg" },
  bench_press:       { key: "bench_press",       label: "Bench press",       mvt: 0.15, type: "strength",  loadRangeHint: "40–90% est. 1RM" },
  back_squat:        { key: "back_squat",        label: "Back squat",        mvt: 0.30, type: "strength",  loadRangeHint: "40–90% est. 1RM" },
  trap_bar_deadlift: { key: "trap_bar_deadlift", label: "Trap-bar deadlift", mvt: 0.18, type: "strength",  loadRangeHint: "50–95% est. 1RM" },
  deadlift:          { key: "deadlift",          label: "Deadlift",          mvt: 0.18, type: "strength",  loadRangeHint: "50–95% est. 1RM" },
  custom:            { key: "custom",            label: "Custom",            mvt: 0.20, type: "strength" },
};

/** A single load-velocity datapoint from the ramp test. */
export interface LvDatapoint {
  load: number;      // kg
  velocity: number;  // m/s (mean concentric velocity)
}

export interface LvProfileResult {
  /** Linear regression load → velocity. v = intercept + slope * load */
  slope: number;
  intercept: number;
  /** Standard error of the estimate (in velocity units, m/s). */
  see: number;
  /** Coefficient of determination 0–1. */
  rSquared: number;
  /** Number of usable datapoints. */
  n: number;

  /** Velocity at load = 0 (intercept). Also called L0 / V0 anchor. */
  yOffsetVelocity: number;
  /** Load at velocity = MVT (predicted 1RM). */
  xOffsetLoad: number;
  /** Load at velocity = 0 (theoretical zero-velocity load — always >= 1RM). */
  zeroVelocityLoad: number;
  /** ±SEE band around the 1RM in kg units (propagated through the slope). */
  estOneRm: number;
  estOneRmHigh: number;
  estOneRmLow: number;

  /** Profile classification — velocity-dominant, strength-dominant, balanced. */
  profile: LvProfileType;
  profileReason: string;

  /** Echo of the MVT used so callers can show it. */
  mvtUsed: number;
}

export type LvProfileType = "velocity_dominant" | "strength_dominant" | "balanced" | "insufficient_data";

/** Predict velocity for a given load from the regression. */
export function predictVelocity(load: number, slope: number, intercept: number): number {
  return intercept + slope * load;
}

/** Predict load for a given velocity (inverse). */
export function predictLoad(velocity: number, slope: number, intercept: number): number | null {
  if (slope === 0) return null;
  return (velocity - intercept) / slope;
}

/**
 * Compute the LV profile from 2+ (load, velocity) datapoints + the MVT.
 *
 * Returns null when there isn't enough data to fit a line (n < 2 or all
 * loads identical → slope undefined). Throws nothing — bad inputs come back
 * as null so the caller can show a friendly message.
 */
export function computeLvProfile(
  datapoints: LvDatapoint[],
  mvt: number,
): LvProfileResult | null {
  const clean = datapoints
    .filter((d) => Number.isFinite(d.load) && Number.isFinite(d.velocity) && d.load >= 0 && d.velocity > 0);

  if (clean.length < 2) return null;

  const xs = clean.map((d) => d.load);
  const ys = clean.map((d) => d.velocity);
  const n = clean.length;

  // All loads identical → can't fit a slope.
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  if (xMax - xMin < 0.0001) return null;

  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;

  let ssXY = 0;
  let ssXX = 0;
  let ssYY = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    ssXY += dx * dy;
    ssXX += dx * dx;
    ssYY += dy * dy;
  }

  const slope = ssXY / ssXX;
  const intercept = meanY - slope * meanX;

  // Residual variance for SEE — use n-2 dof for linear regression.
  let ssRes = 0;
  for (let i = 0; i < n; i += 1) {
    const pred = intercept + slope * xs[i];
    ssRes += (ys[i] - pred) ** 2;
  }
  const dof = Math.max(n - 2, 1);
  const see = Math.sqrt(ssRes / dof);

  const rSquared = ssYY > 0 ? 1 - ssRes / ssYY : 0;

  const yOffsetVelocity = intercept;
  // x at v=MVT → (MVT - intercept) / slope
  const xOffsetLoad = (mvt - intercept) / slope;
  // x at v=0 → -intercept / slope
  const zeroVelocityLoad = -intercept / slope;

  // ±SEE in kg: propagate through 1 / |slope|. Larger SEE in velocity =
  // wider 1RM band. Same convention as the reference workbook.
  const seeKg = see / Math.abs(slope);

  const estOneRm = xOffsetLoad;
  const estOneRmHigh = xOffsetLoad + seeKg;
  const estOneRmLow = xOffsetLoad - seeKg;

  const { profile, reason } = classifyProfile({
    yOffsetVelocity,
    xOffsetLoad,
    rSquared,
    mvt,
  });

  return {
    slope,
    intercept,
    see,
    rSquared,
    n,
    yOffsetVelocity,
    xOffsetLoad,
    zeroVelocityLoad,
    estOneRm,
    estOneRmHigh,
    estOneRmLow,
    profile,
    profileReason: reason,
    mvtUsed: mvt,
  };
}

/**
 * Heuristic classifier: compares the athlete's y-offset (V0) and 1RM (x-offset)
 * to typical reference ranges. Velocity-dominant athletes maintain high V at
 * low load but lose force production capacity at high load; strength-dominant
 * athletes show the inverse pattern.
 *
 * We bucket by where the line sits relative to two reference points (1RM and
 * theoretical V0 at load 0). The thresholds are loose because absolute V0
 * varies by lift — they're meant as a coaching hint, not a strict diagnosis.
 */
function classifyProfile(args: {
  yOffsetVelocity: number;
  xOffsetLoad: number;
  rSquared: number;
  mvt: number;
}): { profile: LvProfileType; reason: string } {
  const { yOffsetVelocity, xOffsetLoad, rSquared, mvt } = args;
  if (rSquared < 0.7) {
    return {
      profile: "insufficient_data",
      reason: `R² ${rSquared.toFixed(2)} is below 0.70 — add another load or re-test for a cleaner fit.`,
    };
  }
  // Normalize: how "tall" is the V0 vs MVT? Ratio > 6 = mostly fast, < 3 = mostly heavy.
  const vRatio = yOffsetVelocity / Math.max(mvt, 0.01);
  if (vRatio > 6) {
    return {
      profile: "velocity_dominant",
      reason: `Y-offset ${yOffsetVelocity.toFixed(2)} m/s (${vRatio.toFixed(1)}× MVT) — high force at low load but force drops sharply with weight. Bias programming toward maximal-strength work.`,
    };
  }
  if (vRatio < 3.5) {
    return {
      profile: "strength_dominant",
      reason: `Y-offset ${yOffsetVelocity.toFixed(2)} m/s (${vRatio.toFixed(1)}× MVT) — strong at heavy loads but flat V at light loads. Bias programming toward velocity / power development.`,
    };
  }
  return {
    profile: "balanced",
    reason: `Y-offset ${yOffsetVelocity.toFixed(2)} m/s (${vRatio.toFixed(1)}× MVT) — proportionate force across the load spectrum. Maintain concurrent strength + velocity work.`,
  };
}

/* ── DSI (Dynamic Strength Index) helper ────────────────────────────── */

export type DsiTier = "ballistic" | "concurrent" | "max_strength" | "insufficient";

export interface DsiResult {
  ratio: number;
  tier: DsiTier;
  recommendation: string;
}

/**
 * DSI = ballistic peak force ÷ isometric/dynamic peak force.
 * Sheward 2010, Suchomel 2016 — thresholds:
 *   <0.6 → ballistic training (athlete already very strong, lacks rate of force dev)
 *   0.6-0.8 → concurrent strength + ballistic
 *   >0.8 → max strength (athlete can already express force ballistically,
 *          ceiling is total strength)
 */
export function computeDsi(ballisticPeakN: number, isoPeakN: number): DsiResult | null {
  if (!Number.isFinite(ballisticPeakN) || !Number.isFinite(isoPeakN) || isoPeakN <= 0) return null;
  const ratio = ballisticPeakN / isoPeakN;
  if (ratio < 0.6) {
    return {
      ratio,
      tier: "ballistic",
      recommendation: "Prioritise ballistic / power-bias training — strength reserve is already high relative to ballistic expression.",
    };
  }
  if (ratio <= 0.8) {
    return {
      ratio,
      tier: "concurrent",
      recommendation: "Concurrent training — alternate maximal-strength and ballistic blocks.",
    };
  }
  return {
    ratio,
    tier: "max_strength",
    recommendation: "Prioritise maximal-strength training — athlete already converts strength to power well; raising the strength ceiling is the next gain.",
  };
}

/* ── Velocity-loss prescription helper ───────────────────────────────── */

/**
 * Given a working load and a velocity-loss target (e.g., 20% drop within
 * a set), returns the velocity zone the athlete should not cross. Lets the
 * coach prescribe "stop the set when velocity drops below X". Pairs with
 * Banyard 2017 / Pareja-Blanco 2017 protocols.
 */
export function velocityLossZone(
  startVelocity: number,
  lossFraction: number,
): number {
  return startVelocity * (1 - Math.max(0, Math.min(1, lossFraction)));
}
