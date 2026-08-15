/**
 * Session Builder — proactive load planning. Pure, side-effect free.
 *
 * The forward counterpart of peakCapacity.ts: instead of reading what a drill WAS (% of his
 * peak), it predicts what a PLANNED drill WILL demand. A coach specifies a drill by duration
 * and a target intensity (% of peak — e.g. "a 6-minute possession at 90%"), and this maps it,
 * per player, onto his own duration-matched capacity → the per-minute rate and total PlayerLoad
 * he'll accumulate. Summed across the planned drills that gives each player's predicted session
 * load — so the coach can balance the session and spot who is being pushed into peak territory
 * BEFORE it happens.
 *
 * The ceiling is the same reference peakCapacity uses (a proxy from his drill history now,
 * the true power curve once the peak-period export lands), so planning and review speak the
 * same language. Descriptive planning context — it never touches the readiness colour, the
 * load target, or the daily decision; it's a coaching aid the coach owns and overrides.
 *
 * Cite: Delaney 2017 (peak locomotor demands) · ADI / Catapult (peak-capacity / % of max).
 */

import { ceilingFor, levelFor, type CapacityLevel, type CapacityReference } from "./peakCapacity";

/** A planned drill in the builder — what the coach specifies. */
export interface PlannedDrill {
  id: string;
  label: string;
  durationMin: number;
  /** Target intensity as a % of the player's peak at this duration. */
  targetPct: number;
}

/** The predicted demand of one planned drill for one player. */
export interface DrillPrediction {
  drillId: string;
  label: string;
  durationMin: number;
  targetPct: number;
  ceiling: number | null;        // his peak per-min at this duration (from the reference)
  predictedPerMin: number | null; // ceiling × targetPct/100
  predictedLoad: number | null;   // predictedPerMin × durationMin (PlayerLoad AU)
  level: CapacityLevel;           // tier of the target intensity
}

/** A player's predicted whole-session demand. */
export interface SessionPrediction {
  totalLoad: number | null;      // Σ predictedLoad over drills with a ceiling
  totalDurationMin: number;      // Σ durations (all drills)
  meanIntensityPct: number | null; // load-weighted mean target %
  peakDrills: number;            // drills at "peak" tier
  drills: DrillPrediction[];
  coverage: number;              // drills we could predict (had a ceiling) / total
}

const num = (x: number | null | undefined): number | null => (typeof x === "number" && isFinite(x) ? x : null);
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Predict one planned drill for one player, given his capacity reference. Pure. */
export function predictDrill(drill: PlannedDrill, ref: CapacityReference): DrillPrediction {
  const dur = num(drill.durationMin);
  const pct = num(drill.targetPct);
  const ceiling = dur !== null ? num(ceilingFor(ref, dur)) : null;
  const perMin = ceiling !== null && pct !== null ? (ceiling * pct) / 100 : null;
  const load = perMin !== null && dur !== null ? perMin * dur : null;
  return {
    drillId: drill.id, label: drill.label, durationMin: drill.durationMin, targetPct: drill.targetPct,
    ceiling: ceiling === null ? null : r1(ceiling),
    predictedPerMin: perMin === null ? null : r1(perMin),
    predictedLoad: load === null ? null : Math.round(load),
    level: levelFor(pct),
  };
}

/** Predict a whole planned session for one player. Pure. */
export function predictSession(drills: PlannedDrill[], ref: CapacityReference): SessionPrediction {
  const list = (drills ?? []).map((d) => predictDrill(d, ref));
  const withLoad = list.filter((d) => d.predictedLoad !== null);
  const totalLoad = withLoad.length ? withLoad.reduce((a, d) => a + (d.predictedLoad ?? 0), 0) : null;
  const totalDurationMin = list.reduce((a, d) => a + (num(d.durationMin) ?? 0), 0);
  // Load-weighted mean intensity (a session's overall demand, not a flat average of %).
  const meanIntensityPct = totalLoad && totalLoad > 0
    ? Math.round(withLoad.reduce((a, d) => a + d.targetPct * (d.predictedLoad ?? 0), 0) / totalLoad)
    : null;
  return {
    totalLoad: totalLoad === null ? null : Math.round(totalLoad),
    totalDurationMin: r1(totalDurationMin),
    meanIntensityPct,
    peakDrills: list.filter((d) => d.level === "peak").length,
    drills: list,
    coverage: list.length ? withLoad.length / list.length : 0,
  };
}

/** One squad member's predicted session load (for the builder's per-player table). */
export interface SquadPrediction {
  playerId: string;
  name: string;
  prediction: SessionPrediction;
}

/** Predict the planned session for every player who has a capacity reference. Pure. */
export function predictSquadSession(
  drills: PlannedDrill[],
  refs: Array<{ playerId: string; name: string; reference: CapacityReference }>,
): SquadPrediction[] {
  return (refs ?? []).map((r) => ({ playerId: r.playerId, name: r.name, prediction: predictSession(drills, r.reference) }));
}
