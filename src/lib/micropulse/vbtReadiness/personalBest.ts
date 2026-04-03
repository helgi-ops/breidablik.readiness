/**
 * VBT Personal Best (PB) computation.
 *
 * Computes PB metrics per exercise per player from GymAware data.
 * Used by both coach and player dashboards.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type VbtSetRow = {
  session_date: string;
  exercise_name: string;
  load_kg: number | null;
  reps: number | null;
  mean_velocity: number | null;
  peak_velocity: number | null;
  mean_power: number | null;
  peak_power: number | null;
};

export type VbtExercisePB = {
  exerciseName: string;
  /** Heaviest load ever lifted */
  bestLoadKg: number | null;
  bestLoadDate: string | null;
  /** Best mean velocity (at any load) */
  bestMeanVelocity: number | null;
  bestMeanVelocityLoadKg: number | null;
  bestMeanVelocityDate: string | null;
  /** Best peak power */
  bestPeakPower: number | null;
  bestPeakPowerDate: string | null;
  /** Estimated 1RM from load-velocity profile (linear regression) */
  estimated1RM: number | null;
  /** Total sessions recorded */
  totalSessions: number;
  /** Most recent session */
  lastSessionDate: string | null;
};

export type VbtTodayVsPB = {
  exerciseName: string;
  /** Today's best mean velocity */
  todayMeanVelocity: number | null;
  todayLoadKg: number | null;
  todayPeakPower: number | null;
  /** PB mean velocity at similar load (±15%) */
  pbMeanVelocityAtLoad: number | null;
  pbMeanVelocityAtLoadDate: string | null;
  /** Percentage difference: positive = improvement, negative = below PB */
  velocityVsPbPct: number | null;
  /** PB load overall */
  pbLoadKg: number | null;
  /** Is today a new PB? */
  isNewPB: boolean;
};

/** Per-load best velocity for an exercise — shows the load-velocity profile */
export type VbtLoadBreakdown = {
  loadKg: number;
  bestMeanVelocity: number;
  bestPeakVelocity: number | null;
  bestPeakPower: number | null;
  bestDate: string;
  sets: number;
};

export type VbtPlayerSummary = {
  playerId: string;
  playerName: string;
  exercises: VbtExercisePB[];
  todayComparisons: VbtTodayVsPB[];
  /** Per-exercise, per-load breakdown */
  loadBreakdowns: Record<string, VbtLoadBreakdown[]>;
};

// ─── Constants ───────────────────────────────────────────────────────────────

const LOAD_TOLERANCE = 0.15; // ±15% for "similar load" comparison

// ─── Computation ─────────────────────────────────────────────────────────────

/**
 * Compute PB records per exercise from all historical VBT data.
 */
export function computeExercisePBs(allSets: VbtSetRow[]): VbtExercisePB[] {
  // Group by exercise
  const byExercise = new Map<string, VbtSetRow[]>();
  for (const s of allSets) {
    const key = s.exercise_name.trim();
    if (!key) continue;
    const arr = byExercise.get(key) ?? [];
    arr.push(s);
    byExercise.set(key, arr);
  }

  const results: VbtExercisePB[] = [];

  for (const [exerciseName, sets] of byExercise) {
    let bestLoadKg: number | null = null;
    let bestLoadDate: string | null = null;
    let bestMeanVelocity: number | null = null;
    let bestMeanVelocityLoadKg: number | null = null;
    let bestMeanVelocityDate: string | null = null;
    let bestPeakPower: number | null = null;
    let bestPeakPowerDate: string | null = null;
    let lastSessionDate: string | null = null;

    const sessionDates = new Set<string>();
    const loadVelocityPairs: Array<{ load: number; velocity: number }> = [];

    for (const s of sets) {
      sessionDates.add(s.session_date);

      if (!lastSessionDate || s.session_date > lastSessionDate) {
        lastSessionDate = s.session_date;
      }

      if (s.load_kg != null && (bestLoadKg == null || s.load_kg > bestLoadKg)) {
        bestLoadKg = s.load_kg;
        bestLoadDate = s.session_date;
      }

      if (s.mean_velocity != null && (bestMeanVelocity == null || s.mean_velocity > bestMeanVelocity)) {
        bestMeanVelocity = s.mean_velocity;
        bestMeanVelocityLoadKg = s.load_kg;
        bestMeanVelocityDate = s.session_date;
      }

      if (s.peak_power != null && (bestPeakPower == null || s.peak_power > bestPeakPower)) {
        bestPeakPower = s.peak_power;
        bestPeakPowerDate = s.session_date;
      }

      if (s.load_kg != null && s.mean_velocity != null && s.load_kg > 0 && s.mean_velocity > 0) {
        loadVelocityPairs.push({ load: s.load_kg, velocity: s.mean_velocity });
      }
    }

    // Estimate 1RM from load-velocity profile using linear regression
    // Extrapolate to the load where velocity = 0.3 m/s (minimum movement velocity threshold)
    let estimated1RM: number | null = null;
    if (loadVelocityPairs.length >= 3) {
      const n = loadVelocityPairs.length;
      const sumX = loadVelocityPairs.reduce((a, p) => a + p.load, 0);
      const sumY = loadVelocityPairs.reduce((a, p) => a + p.velocity, 0);
      const sumXY = loadVelocityPairs.reduce((a, p) => a + p.load * p.velocity, 0);
      const sumX2 = loadVelocityPairs.reduce((a, p) => a + p.load * p.load, 0);
      const denom = n * sumX2 - sumX * sumX;
      if (Math.abs(denom) > 0.0001) {
        const slope = (n * sumXY - sumX * sumY) / denom;
        const intercept = (sumY - slope * sumX) / n;
        // Velocity = slope * load + intercept → load at v=0.3
        if (slope < 0 && intercept > 0.3) {
          const e1rm = (0.3 - intercept) / slope;
          if (e1rm > 0 && e1rm < 500) {
            estimated1RM = Math.round(e1rm * 10) / 10;
          }
        }
      }
    }

    results.push({
      exerciseName,
      bestLoadKg,
      bestLoadDate,
      bestMeanVelocity,
      bestMeanVelocityLoadKg,
      bestMeanVelocityDate,
      bestPeakPower,
      bestPeakPowerDate,
      estimated1RM,
      totalSessions: sessionDates.size,
      lastSessionDate,
    });
  }

  // Sort by most recent session
  results.sort((a, b) => (b.lastSessionDate ?? "").localeCompare(a.lastSessionDate ?? ""));

  return results;
}

/**
 * Compute per-load breakdown for each exercise.
 * Groups sets by exercise → load (rounded to nearest 5kg) and returns best velocity at each load.
 */
export function computeLoadBreakdowns(allSets: VbtSetRow[]): Record<string, VbtLoadBreakdown[]> {
  // Group by exercise
  const byExercise = new Map<string, VbtSetRow[]>();
  for (const s of allSets) {
    const key = s.exercise_name.trim();
    if (!key || s.load_kg == null || s.mean_velocity == null) continue;
    const arr = byExercise.get(key) ?? [];
    arr.push(s);
    byExercise.set(key, arr);
  }

  const result: Record<string, VbtLoadBreakdown[]> = {};

  for (const [exerciseName, sets] of byExercise) {
    // Group by exact load (kg)
    const byLoad = new Map<number, VbtSetRow[]>();
    for (const s of sets) {
      const load = s.load_kg!;
      const arr = byLoad.get(load) ?? [];
      arr.push(s);
      byLoad.set(load, arr);
    }

    const breakdowns: VbtLoadBreakdown[] = [];

    for (const [loadKg, loadSets] of byLoad) {
      let bestMeanVelocity = -Infinity;
      let bestPeakVelocity: number | null = null;
      let bestPeakPower: number | null = null;
      let bestDate = "";

      for (const s of loadSets) {
        if (s.mean_velocity != null && s.mean_velocity > bestMeanVelocity) {
          bestMeanVelocity = s.mean_velocity;
          bestDate = s.session_date;
          bestPeakVelocity = s.peak_velocity;
          bestPeakPower = s.peak_power;
        }
      }

      if (bestMeanVelocity > -Infinity) {
        breakdowns.push({
          loadKg,
          bestMeanVelocity,
          bestPeakVelocity,
          bestPeakPower,
          bestDate,
          sets: loadSets.length,
        });
      }
    }

    // Sort by load ascending
    breakdowns.sort((a, b) => a.loadKg - b.loadKg);
    result[exerciseName] = breakdowns;
  }

  return result;
}

/**
 * Compare today's sets to PB for each exercise.
 */
export function computeTodayVsPB(
  todaySets: VbtSetRow[],
  allHistorySets: VbtSetRow[],
): VbtTodayVsPB[] {
  // Group today's sets by exercise, keep best mean velocity per exercise
  const todayByExercise = new Map<string, VbtSetRow>();
  for (const s of todaySets) {
    const key = s.exercise_name.trim();
    if (!key || s.mean_velocity == null) continue;
    const existing = todayByExercise.get(key);
    if (!existing || (s.mean_velocity ?? 0) > (existing.mean_velocity ?? 0)) {
      todayByExercise.set(key, s);
    }
  }

  const results: VbtTodayVsPB[] = [];

  for (const [exerciseName, todayBest] of todayByExercise) {
    // Find PB mean velocity at similar load from history
    let pbMeanVelocityAtLoad: number | null = null;
    let pbMeanVelocityAtLoadDate: string | null = null;
    let pbLoadKg: number | null = null;

    for (const h of allHistorySets) {
      if (h.exercise_name.trim() !== exerciseName) continue;

      // Track overall best load
      if (h.load_kg != null && (pbLoadKg == null || h.load_kg > pbLoadKg)) {
        pbLoadKg = h.load_kg;
      }

      // Find best velocity at similar load
      if (h.mean_velocity != null && todayBest.load_kg != null && h.load_kg != null) {
        const ratio = Math.abs(h.load_kg - todayBest.load_kg) / todayBest.load_kg;
        if (ratio <= LOAD_TOLERANCE) {
          if (pbMeanVelocityAtLoad == null || h.mean_velocity > pbMeanVelocityAtLoad) {
            pbMeanVelocityAtLoad = h.mean_velocity;
            pbMeanVelocityAtLoadDate = h.session_date;
          }
        }
      }
    }

    // Calculate velocity vs PB percentage
    let velocityVsPbPct: number | null = null;
    let isNewPB = false;

    if (pbMeanVelocityAtLoad != null && todayBest.mean_velocity != null) {
      velocityVsPbPct = ((todayBest.mean_velocity - pbMeanVelocityAtLoad) / pbMeanVelocityAtLoad) * 100;
      isNewPB = todayBest.mean_velocity > pbMeanVelocityAtLoad;
    }

    // Also check if today's load is a new PB load
    if (todayBest.load_kg != null && (pbLoadKg == null || todayBest.load_kg > pbLoadKg)) {
      isNewPB = true;
    }

    results.push({
      exerciseName,
      todayMeanVelocity: todayBest.mean_velocity,
      todayLoadKg: todayBest.load_kg,
      todayPeakPower: todayBest.peak_power,
      pbMeanVelocityAtLoad,
      pbMeanVelocityAtLoadDate,
      velocityVsPbPct,
      pbLoadKg,
      isNewPB,
    });
  }

  return results;
}
