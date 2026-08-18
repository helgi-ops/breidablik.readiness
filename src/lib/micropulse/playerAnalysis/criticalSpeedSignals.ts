/**
 * Critical Speed / D′ → athlete-radar signals (Power Curve Intelligence on the profile).
 *
 * Pure and IO-free: given each player's maximal-run efforts (+ optional GPS mean-maximal
 * distance curve), it fits Critical Speed and D′ with the SAME engine the Power Curve
 * Intelligence page uses (computeCriticalSpeedCombined) and emits two MetricSamples:
 *   - aerobic_endurance  = Critical Speed (km/h) — the sustainable-speed asymptote
 *   - anaerobic_reserve  = D′ (m)                — the finite above-CS distance tank
 *
 * Only a VALID fit produces a sample; a player without enough anchors emits nothing, so
 * the quality shows "not enough data" on the radar rather than a fabricated dot (manifesto:
 * confidence + provenance, never invent). The route does the IO and calls this. The radar
 * percentiles the raw values itself, so no squad pool is needed here.
 *
 * Cite: Critical Speed (Jones & Vanhatalo 2017); D′ expenditure (Skiba 2012); di Prampero
 * 2015 (metabolic-power basis). Descriptive conditioning context — never touches readiness.
 */

import { computeCriticalSpeedCombined, type CsTestEffort } from "@/lib/micropulse/load/criticalSpeed";
import type { PowerCurve } from "@/lib/micropulse/load/peakPeriod";
import type { AthleteSignalSet } from "./athleteProfile";

export type PlayerCsInput = {
  playerId: string;
  /** GPS mean-maximal DISTANCE curve points (window minutes → metres/min). May be empty. */
  miiPoints: Array<{ windowMin: number; value: number }>;
  /** Trusted maximal running-test efforts (duration + distance). May be empty. */
  efforts: CsTestEffort[];
  /** ISO date to stamp the sample with (latest contributing test/session), or null. */
  date?: string | null;
};

/** Build the CS/D′ signal set for ONE player from a combined fit — empty when the fit fails. */
export function csSignalsForPlayer(input: PlayerCsInput): AthleteSignalSet {
  const curve: PowerCurve = {
    metric: "distance", unit: "m/min",
    points: input.miiPoints.map((p) => ({ windowMin: p.windowMin, value: p.value, index: null })),
  };
  const res = computeCriticalSpeedCombined(curve, input.efforts);
  const set: AthleteSignalSet = {};
  // fitPoints is the actual number of (window, distance) points the fit used → confidence.
  const n = res.fitPoints?.length ?? res.nPoints ?? 0;
  const src = res.usedTestAnchor ? "Critical Speed · test" : "Critical Speed · GPS";
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
