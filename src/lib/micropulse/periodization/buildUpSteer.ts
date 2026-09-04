/**
 * Weakness-steered pre-season build-up (pure).
 *
 * Reads the player's ATHLETE-axis weaknesses from Total Player Analysis (it does NOT recompute them —
 * the hub consumes the module) and maps each weak quality to the build-up axis that develops it, so the
 * per-KPI ramp biases toward what the player is behind on instead of ramping every KPI uniformly.
 *
 * PERFORMANCE / PLANNING ONLY — this steers a training plan; it never sets or reads the readiness colour.
 * The bias stays inside the ramp engine's existing safe caps (the caller re-clamps to the position band).
 * Rules compute; the coach can drop the bias to a neutral ramp.
 */

import type { QualityId } from "@/lib/micropulse/playerAnalysis/athleteProfile";

export type SteerAxis = "hsr" | "mech" | "strength";
export type Bi = { en: string; is: string };

/** Athlete quality → the build-up axis + the KPI(s) that develop it. `hsr` = the running axis
 *  (distance / HSR / stride), `mech` = the mechanical axis (Player Load / Acc·Dec Band 2–3),
 *  `strength` = the force/VBT side (surfaced via the VALD focus, not a GPS-ramp lever). */
export const WEAKNESS_AXIS: Record<QualityId, { axis: SteerAxis; kpis: Bi }> = {
  work_capacity: { axis: "hsr", kpis: { en: "HSR + repeated-sprint efforts", is: "háhraði + endurteknir sprettir" } },
  speed: { axis: "hsr", kpis: { en: "sprint / high-speed distance", is: "sprettur / háhraðavegalengd" } },
  aerobic_endurance: { axis: "hsr", kpis: { en: "distance + HSR volume", is: "vegalengd + háhraða-magn" } },
  anaerobic_reserve: { axis: "hsr", kpis: { en: "supra-CS HSR intervals", is: "yfir-CS háhraða-interval" } },
  acceleration: { axis: "mech", kpis: { en: "Acc Band 2–3 efforts", is: "Acc Band 2–3 átök" } },
  deceleration: { axis: "mech", kpis: { en: "Dec Band 2–3 efforts", is: "Dec Band 2–3 átök" } },
  change_of_direction: { axis: "mech", kpis: { en: "Acc/Dec + change-of-direction", is: "Acc/Dec + stefnubreytingar" } },
  mechanical_power: { axis: "mech", kpis: { en: "mechanical (Acc/Dec) load", is: "vélrænt (Acc/Dec) álag" } },
  peak_demands: { axis: "mech", kpis: { en: "peak-intensity Player Load", is: "hámarks-ákefðar Player Load" } },
  max_strength: { axis: "strength", kpis: { en: "heavy strength (VBT)", is: "þungur styrkur (VBT)" } },
  vbt_power: { axis: "strength", kpis: { en: "power / VBT", is: "afl / VBT" } },
  reactive_power: { axis: "strength", kpis: { en: "plyometrics / reactive (RSI)", is: "stökkæfingar / viðbragð (RSI)" } },
  robustness: { axis: "strength", kpis: { en: "unilateral strength (symmetry)", is: "einfættur styrkur (samhverfa)" } },
};

export type WeaknessInput = {
  id: QualityId;
  percentile: number | null;
  confidence: "high" | "moderate" | "low";
  benchmark: "position" | "squad" | null;
  poolSize: number;
};
export type SteerTarget = { id: QualityId; percentile: number | null; axis: SteerAxis; kpis: Bi; hint: boolean };
export type BuildUpSteer = {
  hsrBoost: number;   // multiplier to layer on the running-axis emphasis (caller re-clamps to the safe band)
  mechBoost: number;  // multiplier to layer on the mechanical-axis emphasis
  targets: SteerTarget[];        // every mapped weakness (hard + hint), worst-percentile first
  strengthTargets: SteerTarget[];// force/VBT weaknesses → the VALD focus covers these, not the GPS ramp
  hasHard: boolean;   // at least one confident (non-hint) GPS-axis weakness actually biased the ramp
};

const BOOST = 1.10;    // one confident weakness on an axis lifts its emphasis ~10%
const BOOST_CAP = 1.2; // two weaknesses on the same axis don't compound past +20% (safety)

/** A weakness only BIASES the ramp when it's trustworthy; a low-confidence or small/squad-fallback
 *  pool weakness is surfaced as a hint, never a hard target (don't over-index on thin data). */
export function isHintOnly(w: WeaknessInput): boolean {
  return w.confidence === "low" || w.benchmark === "squad" || w.poolSize < 4;
}

export function computeBuildUpSteer(weaknesses: WeaknessInput[]): BuildUpSteer {
  const targets: SteerTarget[] = [];
  const strengthTargets: SteerTarget[] = [];
  let hsrBoost = 1, mechBoost = 1, hasHard = false;
  for (const w of weaknesses) {
    const m = WEAKNESS_AXIS[w.id];
    if (!m) continue;
    const hint = isHintOnly(w);
    const t: SteerTarget = { id: w.id, percentile: w.percentile, axis: m.axis, kpis: m.kpis, hint };
    if (m.axis === "strength") { strengthTargets.push(t); continue; }
    targets.push(t);
    if (!hint) {
      hasHard = true;
      if (m.axis === "hsr") hsrBoost *= BOOST; else mechBoost *= BOOST;
    }
  }
  targets.sort((a, b) => (a.percentile ?? 100) - (b.percentile ?? 100));
  return {
    hsrBoost: Math.min(BOOST_CAP, hsrBoost),
    mechBoost: Math.min(BOOST_CAP, mechBoost),
    targets, strengthTargets, hasHard,
  };
}
