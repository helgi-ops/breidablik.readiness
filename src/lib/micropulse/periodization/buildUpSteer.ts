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

/** Train-like-you-Play match-EXPOSURE gap → the build-up axis that closes it. A second, independent
 *  driver of the same ramp bias: "weakness" is what he's behind on vs peers (percentiles); "exposure"
 *  is what his TRAINING under-does vs his own MATCHES. Accel/decel/CoD → mech; speed/HSR → hsr
 *  (mirrors WEAKNESS_AXIS). pl_per_min is a rate, not a volume gap, so it's intentionally left out. */
export const TLYP_METRIC_AXIS: Record<string, { axis: SteerAxis; label: Bi }> = {
  top_speed: { axis: "hsr", label: { en: "top speed", is: "hámarkshraði" } },
  fmp_run_high: { axis: "hsr", label: { en: "high-speed running", is: "háhraðahlaup" } },
  hsr_dist: { axis: "hsr", label: { en: "high-speed running", is: "háhraðahlaup" } },
  sprint_eff: { axis: "hsr", label: { en: "sprint efforts", is: "spretta-átök" } },
  ima_accel: { axis: "mech", label: { en: "accelerations", is: "hröðun" } },
  ima_decel: { axis: "mech", label: { en: "decelerations", is: "hemlun" } },
  decel_eff: { axis: "mech", label: { en: "accel/decel efforts", is: "accel/decel átök" } },
  ima_cod: { axis: "mech", label: { en: "change-of-direction", is: "stefnubreytingar" } },
  ima_jumps: { axis: "mech", label: { en: "jumps", is: "stökk" } },
  fmp_dyn_high: { axis: "mech", label: { en: "dynamic accelerations", is: "dýnamísk hröðun" } },
  fmp_dyn_med: { axis: "mech", label: { en: "dynamic accelerations", is: "dýnamísk hröðun" } },
  player_load: { axis: "mech", label: { en: "mechanical load (Player Load)", is: "vélrænt álag (Player Load)" } },
};

export type ExposureInput = { key: string; axis: SteerAxis; label: Bi; flag: "under" | "gap"; pct: number | null };
export type ExposureTarget = ExposureInput & { hint: boolean };

/** 12 clock directions (12 = straight forward) → movement family. Mirrors peakMovementSignature's
 *  FORWARD/BACKWARD/LATERAL sectors, so "under-trains lateral vs games" tilts the plan's direction split. */
export type DirFamily = "fwd" | "back" | "lat";
export const DIR_FAMILY: Record<string, DirFamily> = {
  "11": "fwd", "12": "fwd", "1": "fwd",
  "5": "back", "6": "back", "7": "back",
  "2": "lat", "3": "lat", "4": "lat", "8": "lat", "9": "lat", "10": "lat",
};
/** A movement-shape under-trained direction (from train-vs-play-shape): delta = game-share − train-share
 *  (>0 = he does this direction MORE in games than training). */
export type ShapeDirInput = { dir: string; delta: number };
export type DirEmph = { fwd: number; back: number; lat: number };
export type DirTarget = { family: DirFamily; deltaPts: number; hint: boolean };

export type BuildUpSteer = {
  hsrBoost: number;   // multiplier to layer on the running-axis emphasis (caller re-clamps to the safe band)
  mechBoost: number;  // multiplier to layer on the mechanical-axis emphasis
  dirEmph: DirEmph;   // per-family multiplier for the plan's direction split (1 = neutral)
  targets: SteerTarget[];        // every mapped weakness (hard + hint), worst-percentile first
  strengthTargets: SteerTarget[];// force/VBT weaknesses → the VALD focus covers these, not the GPS ramp
  exposureTargets: ExposureTarget[]; // TLYP match-exposure gaps mapped to an axis, worst-exposed first
  dirTargets: DirTarget[];       // movement-shape families under-trained vs games, biggest gap first
  hasHard: boolean;   // at least one confident (non-hint) signal actually biased the ramp / direction
};

const DIR_FLAG = 0.05; // a family under-trained by ≥5 share-points vs matches biases the direction split

const BOOST = 1.10;    // one confident weakness on an axis lifts its emphasis ~10%
const BOOST_CAP = 1.2; // two weaknesses on the same axis don't compound past +20% (safety)

/** A weakness only BIASES the ramp when it's trustworthy; a low-confidence or small/squad-fallback
 *  pool weakness is surfaced as a hint, never a hard target (don't over-index on thin data). */
export function isHintOnly(w: WeaknessInput): boolean {
  return w.confidence === "low" || w.benchmark === "squad" || w.poolSize < 4;
}

/**
 * @param weaknesses athlete-axis weaknesses from Total Player Analysis (percentile-based).
 * @param exposures  Train-like-you-Play match-exposure gaps (training vs own matches). Both drivers
 *                   bias the SAME hsr/mech boosts; the ±20% cap keeps them from compounding.
 */
export function computeBuildUpSteer(weaknesses: WeaknessInput[], exposures: ExposureInput[] = [], shapeDirs: ShapeDirInput[] = []): BuildUpSteer {
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

  // Match-exposure gaps. Only a real under-exposure (<50% of match, flag "under") biases the ramp;
  // a milder "gap" is surfaced as a hint but doesn't move the dose (don't over-index). Shares the
  // same accumulators, so an axis flagged by BOTH a weakness and an exposure still caps at +20%.
  const exposureTargets: ExposureTarget[] = [];
  for (const e of exposures) {
    if (e.axis === "strength") continue; // TLYP has no strength-axis metric
    const hint = e.flag !== "under";
    exposureTargets.push({ ...e, hint });
    if (!hint) {
      hasHard = true;
      if (e.axis === "hsr") hsrBoost *= BOOST; else mechBoost *= BOOST;
    }
  }
  exposureTargets.sort((a, b) => (a.pct ?? 100) - (b.pct ?? 100));

  // Movement-shape direction gaps → tilt the plan's fwd/back/lat split toward the family he
  // under-does vs his matches. Sum the under-trained share-points per family; a family past the
  // flag gets a flat ±10% tilt (no magnitude scaling — conservative). "match the way he plays".
  const famDelta: Record<DirFamily, number> = { fwd: 0, back: 0, lat: 0 };
  for (const d of shapeDirs) { const f = DIR_FAMILY[d.dir]; if (f && d.delta > 0) famDelta[f] += d.delta; }
  const dirEmph: DirEmph = { fwd: 1, back: 1, lat: 1 };
  const dirTargets: DirTarget[] = [];
  for (const f of ["fwd", "back", "lat"] as DirFamily[]) {
    if (famDelta[f] <= 0) continue;
    const hint = famDelta[f] < DIR_FLAG;
    dirTargets.push({ family: f, deltaPts: Math.round(famDelta[f] * 100), hint });
    if (!hint) { dirEmph[f] = BOOST; hasHard = true; }
  }
  dirTargets.sort((a, b) => b.deltaPts - a.deltaPts);

  return {
    hsrBoost: Math.min(BOOST_CAP, hsrBoost),
    mechBoost: Math.min(BOOST_CAP, mechBoost),
    dirEmph,
    targets, strengthTargets, exposureTargets, dirTargets, hasHard,
  };
}
