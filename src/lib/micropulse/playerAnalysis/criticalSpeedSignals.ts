/**
 * Critical Speed / D′ → athlete-radar signals (Power Curve Intelligence on the profile).
 *
 * Pure and IO-free. For the radar we fit CS/D′ from the GPS mean-maximal DISTANCE power
 * curve alone (the densest 1/3/5-min windows, in m/min) with computeCriticalSpeed — the
 * ADI-style power-curve conditioning read. We deliberately do NOT anchor on the track MAS
 * test here: a single maximal test on one duration can't fit a line, and its pure-running
 * pace lives on a different scale than the GPS distance-rate curve — mixing the two across
 * the squad would break the position-percentile comparison. The Conditioning page keeps the
 * test-anchored, higher-precision CS (which needs ≥2 maximal efforts); the radar uses the
 * broadly-available, internally-consistent GPS curve so the axis is comparable squad-wide.
 *
 * Emits two MetricSamples:
 *   - aerobic_endurance = Critical Speed (km/h) — the sustainable distance-rate asymptote
 *   - anaerobic_reserve = D′ (m)                — the finite above-CS distance tank
 * Only a VALID fit (≥2 windows, cs>0, D′≥0) produces a sample; otherwise nothing, so the
 * quality shows "not enough data" rather than a fabricated dot (manifesto: confidence +
 * provenance, never invent).
 *
 * Cite: Critical Speed (Jones & Vanhatalo 2017); D′ expenditure (Skiba 2012); di Prampero
 * 2015 (power-curve basis). Descriptive conditioning context — never touches readiness.
 */

import { computeCriticalSpeed } from "@/lib/micropulse/load/criticalSpeed";
import type { PowerCurve } from "@/lib/micropulse/load/peakPeriod";
import type { AthleteSignalSet } from "./athleteProfile";

export type PlayerCsInput = {
  playerId: string;
  /** GPS mean-maximal DISTANCE curve points (window minutes → metres/min). ≥2 needed to fit. */
  miiPoints: Array<{ windowMin: number; value: number }>;
  /** ISO date to stamp the sample with (latest contributing session), or null. */
  date?: string | null;
};

/** Build the CS/D′ signal set for ONE player from the GPS power curve — empty when it can't fit. */
export function csSignalsForPlayer(input: PlayerCsInput): AthleteSignalSet {
  const curve: PowerCurve = {
    metric: "distance", unit: "m/min",
    points: input.miiPoints.map((p) => ({ windowMin: p.windowMin, value: p.value, index: null })),
  };
  const res = computeCriticalSpeed(curve);
  const set: AthleteSignalSet = {};
  const n = res.nPoints ?? input.miiPoints.length;
  const src = "Critical Speed · GPS";
  if (res.csKmh != null) {
    set.aerobic_endurance = { value: res.csKmh, unit: "km/h", source: src, date: input.date ?? null, sampleSize: n };
  }
  if (res.dPrimeM != null) {
    set.anaerobic_reserve = { value: res.dPrimeM, unit: "m", source: src, date: input.date ?? null, sampleSize: n };
  }
  return set;
}

/** Build CS/D′ signals for a squad → Map<playerId, AthleteSignalSet>. Players with no valid
 *  fit are omitted (the quality reads "not enough data" downstream, never fabricated). */
export function buildCriticalSpeedSignals(inputs: PlayerCsInput[]): Map<string, AthleteSignalSet> {
  const out = new Map<string, AthleteSignalSet>();
  for (const input of inputs) {
    const set = csSignalsForPlayer(input);
    if (set.aerobic_endurance || set.anaerobic_reserve) out.set(input.playerId, set);
  }
  return out;
}
