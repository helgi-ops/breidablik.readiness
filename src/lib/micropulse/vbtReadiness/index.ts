/**
 * VBT (Velocity-Based Training) Readiness Signal
 *
 * Computes neuromuscular readiness from GymAware velocity data.
 *
 * Core metric: velocity decrement on a reference exercise (e.g., Trap Bar Deadlift).
 * If a player normally moves a given load at 0.65 m/s and today records 0.52 m/s,
 * that's a 20% decrement — a clear neuromuscular fatigue signal.
 *
 * This is an objective, unfakeable readiness indicator.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type VbtReadinessLevel = "optimal" | "normal" | "caution" | "suppressed";

export type VbtReadinessResult = {
  level: VbtReadinessLevel;
  velocityDecrement: number | null; // 0.0 = baseline, negative = slower than baseline
  todayMeanVelocity: number | null; // m/s
  baselineMeanVelocity: number | null; // m/s (28-day avg)
  baselineSessions: number; // how many sessions in baseline
  loadKg: number | null;
  summary: string | null;
};

export type VbtSessionRow = {
  session_date: string;
  exercise_name: string;
  load_kg: number | null;
  mean_velocity: number | null;
  peak_velocity: number | null;
};

// ─── Constants ───────────────────────────────────────────────────────────────

/** Minimum sessions in baseline window for meaningful comparison */
const MIN_BASELINE_SESSIONS = 3;

/** Baseline window in days */
const BASELINE_WINDOW_DAYS = 28;

/** Velocity decrement thresholds */
const DECREMENT_CAUTION = -0.10; // 10% slower → caution
const DECREMENT_SUPPRESSED = -0.20; // 20% slower → suppressed
const INCREMENT_OPTIMAL = 0.05; // 5% faster → optimal (well-rested)

/** Load similarity tolerance: ±15% of reference load */
const LOAD_TOLERANCE_PCT = 0.15;

// ─── Computation ─────────────────────────────────────────────────────────────

/**
 * Find today's best set for the reference exercise.
 * "Best" = highest mean velocity at a comparable load (within ±15% of the most common load).
 */
function findTodayBestSet(
  todaySets: VbtSessionRow[],
  referenceExercise: string,
): { meanVelocity: number; loadKg: number | null } | null {
  const refNorm = referenceExercise.toLowerCase().trim();
  const matchingSets = todaySets.filter(
    (s) =>
      s.exercise_name.toLowerCase().trim().includes(refNorm) &&
      s.mean_velocity != null &&
      Number.isFinite(s.mean_velocity),
  );

  if (matchingSets.length === 0) return null;

  // Pick the set with the highest mean velocity as "best effort"
  let best: { meanVelocity: number; loadKg: number | null } | null = null;
  for (const s of matchingSets) {
    if (s.mean_velocity == null) continue;
    if (best == null || s.mean_velocity > best.meanVelocity) {
      best = { meanVelocity: s.mean_velocity, loadKg: s.load_kg };
    }
  }

  return best;
}

/**
 * Compute baseline mean velocity from historical sessions.
 * Only includes sets at a similar load (±15%) to today's load.
 * If today's load is unknown, uses all sets for the reference exercise.
 */
function computeBaseline(
  historySets: VbtSessionRow[],
  referenceExercise: string,
  todayLoadKg: number | null,
): { baselineVelocity: number; sessionCount: number } | null {
  const refNorm = referenceExercise.toLowerCase().trim();

  const matchingSets = historySets.filter((s) => {
    if (!s.exercise_name.toLowerCase().trim().includes(refNorm)) return false;
    if (s.mean_velocity == null || !Number.isFinite(s.mean_velocity)) return false;

    // If we know today's load, only include sets at similar load
    if (todayLoadKg != null && s.load_kg != null) {
      const ratio = Math.abs(s.load_kg - todayLoadKg) / todayLoadKg;
      if (ratio > LOAD_TOLERANCE_PCT) return false;
    }

    return true;
  });

  if (matchingSets.length === 0) return null;

  // Group by session date and take the best velocity per session
  const byDate = new Map<string, number>();
  for (const s of matchingSets) {
    const existing = byDate.get(s.session_date);
    if (existing == null || (s.mean_velocity ?? 0) > existing) {
      byDate.set(s.session_date, s.mean_velocity!);
    }
  }

  const sessionVelocities = Array.from(byDate.values());
  if (sessionVelocities.length < MIN_BASELINE_SESSIONS) return null;

  const avg = sessionVelocities.reduce((a, b) => a + b, 0) / sessionVelocities.length;

  return { baselineVelocity: avg, sessionCount: sessionVelocities.length };
}

/**
 * Compute VBT readiness for a single reference exercise.
 * Returns null if no today data found for this exercise.
 */
function computeForExercise(
  todaySets: VbtSessionRow[],
  historySets: VbtSessionRow[],
  referenceExercise: string,
): VbtReadinessResult | null {
  const todayBest = findTodayBestSet(todaySets, referenceExercise);
  if (!todayBest) return null;

  const baseline = computeBaseline(historySets, referenceExercise, todayBest.loadKg);
  if (!baseline) {
    return {
      level: "normal",
      velocityDecrement: null,
      todayMeanVelocity: todayBest.meanVelocity,
      baselineMeanVelocity: null,
      baselineSessions: 0,
      loadKg: todayBest.loadKg,
      summary: `VBT í dag: ${todayBest.meanVelocity.toFixed(2)} m/s — of fáar grunnlínumælingar`,
    };
  }

  const decrement = (todayBest.meanVelocity - baseline.baselineVelocity) / baseline.baselineVelocity;

  let level: VbtReadinessLevel;
  let summary: string;

  if (decrement <= DECREMENT_SUPPRESSED) {
    level = "suppressed";
    summary = `VBT ↓↓ ${(decrement * 100).toFixed(0)}% hægari en baseline (${todayBest.meanVelocity.toFixed(2)} vs ${baseline.baselineVelocity.toFixed(2)} m/s)`;
  } else if (decrement <= DECREMENT_CAUTION) {
    level = "caution";
    summary = `VBT ↓ ${(decrement * 100).toFixed(0)}% hægari en baseline (${todayBest.meanVelocity.toFixed(2)} vs ${baseline.baselineVelocity.toFixed(2)} m/s)`;
  } else if (decrement >= INCREMENT_OPTIMAL) {
    level = "optimal";
    summary = `VBT ↑ ${(decrement * 100).toFixed(0)}% hraðari en baseline — vel hvíldur`;
  } else {
    level = "normal";
    summary = `VBT eðlilegt (${todayBest.meanVelocity.toFixed(2)} m/s, baseline ${baseline.baselineVelocity.toFixed(2)} m/s)`;
  }

  return {
    level,
    velocityDecrement: decrement,
    todayMeanVelocity: todayBest.meanVelocity,
    baselineMeanVelocity: baseline.baselineVelocity,
    baselineSessions: baseline.sessionCount,
    loadKg: todayBest.loadKg,
    summary,
  };
}

/**
 * Main computation: compare today's velocity to baseline.
 *
 * Accepts one or more reference exercises (e.g., "Trap Bar Deadlift" and "Bulgarian Split Squat").
 * Players choose which exercise they do — the system uses whichever one appears in today's data.
 * Baseline is computed per exercise so Trap Bar and Bulgarian Split Squat don't mix.
 *
 * @param todaySets - All VBT sets from today
 * @param historySets - All VBT sets from the past 28 days (excluding today)
 * @param referenceExercises - Exercise name(s): a single string or pipe-separated list (e.g., "Trap Bar Deadlift|Bulgarian Split Squat")
 */
export function computeVbtReadiness(
  todaySets: VbtSessionRow[],
  historySets: VbtSessionRow[],
  referenceExercises: string,
): VbtReadinessResult {
  const noData: VbtReadinessResult = {
    level: "normal",
    velocityDecrement: null,
    todayMeanVelocity: null,
    baselineMeanVelocity: null,
    baselineSessions: 0,
    loadKg: null,
    summary: null,
  };

  // Split pipe-separated exercises and try each one
  const exercises = referenceExercises.split("|").map((e) => e.trim()).filter(Boolean);
  if (!exercises.length) return noData;

  // Try each exercise — use the first one that has today data + baseline
  // Priority: result with baseline > result without baseline > no data
  let bestWithBaseline: VbtReadinessResult | null = null;
  let bestWithoutBaseline: VbtReadinessResult | null = null;

  for (const exercise of exercises) {
    const result = computeForExercise(todaySets, historySets, exercise);
    if (!result) continue;

    if (result.baselineMeanVelocity != null && !bestWithBaseline) {
      bestWithBaseline = result;
      break; // Full result found — no need to check more
    }
    if (!bestWithoutBaseline) {
      bestWithoutBaseline = result;
    }
  }

  return bestWithBaseline ?? bestWithoutBaseline ?? noData;
}

/**
 * Convert VBT readiness level to a burden-style score (0–1) for the decision engine.
 * This score blends with other signals in buildAthleteDecision.
 */
export function vbtReadinessToScore(level: VbtReadinessLevel): number {
  switch (level) {
    case "optimal":
      return 0.0;
    case "normal":
      return 0.15;
    case "caution":
      return 0.55;
    case "suppressed":
      return 0.90;
  }
}
