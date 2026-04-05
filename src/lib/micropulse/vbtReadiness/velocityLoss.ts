/**
 * VBT Velocity Loss Detection
 *
 * Detects within-session fatigue by comparing bar velocity of later sets
 * to the baseline established by the first 2 sets of the same exercise
 * at the same load (±10%).
 *
 * A velocity drop ≥ 10% from the first-2-set average signals fatigue.
 *
 * References:
 * - Sánchez-Medina & González-Badillo (2011): velocity loss as fatigue proxy
 * - Pareja-Blanco et al. (2017): 20% velocity loss = significant fatigue
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type VbtSessionSet = {
  player_id: string;
  session_date: string;
  exercise_name: string;
  load_kg: number | null;
  mean_velocity: number | null;
  gymaware_set_id: string;
};

export type VbtVelocityLossFlag = {
  playerId: string;
  exerciseName: string;
  loadKg: number;
  /** Average mean velocity of the first 2 sets (baseline) */
  baselineVelocity: number;
  /** Worst (lowest) mean velocity in later sets */
  worstVelocity: number;
  /** Velocity drop as negative percentage (e.g. -14.2) */
  velocityDropPct: number;
  /** Number of total sets at this load */
  totalSets: number;
};

export type VbtPlayerFatigueResult = {
  playerId: string;
  /** All flagged exercises (velocity drop ≥ threshold) */
  flags: VbtVelocityLossFlag[];
  /** True if any exercise flagged */
  hasFatigue: boolean;
  /** Worst single drop across all exercises */
  worstDropPct: number | null;
};

// ─── Config ─────────────────────────────────────────────────────────────────

/** Minimum velocity drop (%) to flag as fatigue */
const VELOCITY_LOSS_THRESHOLD = -10;

/** Load tolerance for grouping sets at "same load" */
const LOAD_TOLERANCE = 0.10; // ±10%

/** Minimum sets needed to detect fatigue (baseline 2 + at least 1 more) */
const MIN_SETS = 3;

// ─── Computation ────────────────────────────────────────────────────────────

/**
 * Detect velocity loss flags for a single session (one date).
 * Input: all sets for the session, across all players.
 * Output: per-player fatigue results.
 */
export function detectVelocityLoss(
  sets: VbtSessionSet[],
): VbtPlayerFatigueResult[] {
  // Group: player → exercise → load bucket → ordered sets
  const byPlayer = new Map<string, VbtSessionSet[]>();
  for (const s of sets) {
    if (s.mean_velocity == null || s.load_kg == null || s.load_kg <= 0) continue;
    const arr = byPlayer.get(s.player_id) ?? [];
    arr.push(s);
    byPlayer.set(s.player_id, arr);
  }

  const results: VbtPlayerFatigueResult[] = [];

  for (const [playerId, playerSets] of byPlayer) {
    // Group by exercise
    const byExercise = new Map<string, VbtSessionSet[]>();
    for (const s of playerSets) {
      const key = s.exercise_name.trim();
      const arr = byExercise.get(key) ?? [];
      arr.push(s);
      byExercise.set(key, arr);
    }

    const flags: VbtVelocityLossFlag[] = [];

    for (const [exerciseName, exerciseSets] of byExercise) {
      // Sort by gymaware_set_id (chronological order within session)
      const sorted = [...exerciseSets].sort((a, b) =>
        a.gymaware_set_id.localeCompare(b.gymaware_set_id)
      );

      // Group by load bucket (±10%)
      const loadBuckets = groupByLoad(sorted);

      for (const bucket of loadBuckets) {
        if (bucket.sets.length < MIN_SETS) continue;

        // Baseline = average of first 2 sets
        const baseline =
          (bucket.sets[0].mean_velocity! + bucket.sets[1].mean_velocity!) / 2;
        if (baseline <= 0) continue;

        // Find worst velocity in remaining sets (set 3+)
        let worstVelocity = Infinity;
        for (let i = 2; i < bucket.sets.length; i++) {
          const v = bucket.sets[i].mean_velocity!;
          if (v < worstVelocity) worstVelocity = v;
        }

        const dropPct = ((worstVelocity - baseline) / baseline) * 100;

        if (dropPct <= VELOCITY_LOSS_THRESHOLD) {
          flags.push({
            playerId,
            exerciseName,
            loadKg: bucket.representativeLoad,
            baselineVelocity: Math.round(baseline * 1000) / 1000,
            worstVelocity: Math.round(worstVelocity * 1000) / 1000,
            velocityDropPct: Math.round(dropPct * 10) / 10,
            totalSets: bucket.sets.length,
          });
        }
      }
    }

    const worstDrop = flags.length > 0
      ? Math.min(...flags.map((f) => f.velocityDropPct))
      : null;

    results.push({
      playerId,
      flags,
      hasFatigue: flags.length > 0,
      worstDropPct: worstDrop,
    });
  }

  return results;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

type LoadBucket = {
  representativeLoad: number;
  sets: VbtSessionSet[];
};

/**
 * Groups sets by similar load (±10%).
 * Sets are already sorted chronologically.
 */
function groupByLoad(sorted: VbtSessionSet[]): LoadBucket[] {
  const buckets: LoadBucket[] = [];

  for (const s of sorted) {
    const load = s.load_kg!;
    // Try to find an existing bucket within tolerance
    let found = false;
    for (const bucket of buckets) {
      const ratio = load / bucket.representativeLoad;
      if (ratio >= 1 - LOAD_TOLERANCE && ratio <= 1 + LOAD_TOLERANCE) {
        bucket.sets.push(s);
        found = true;
        break;
      }
    }
    if (!found) {
      buckets.push({ representativeLoad: load, sets: [s] });
    }
  }

  return buckets;
}
