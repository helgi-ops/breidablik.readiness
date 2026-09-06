/**
 * Shared pose analyser. Given a test definition and the pose frames, it reads the
 * variables' `extract` specs to know which angles/phases to compute, segments the
 * movement once, samples each variable at its phase, and maps the computed value
 * to a severity band — producing pre-filled findings the coach confirms/overrides.
 *
 * `side: "both"` looks at BOTH legs' landmarks and keeps the WORSE side per
 * per-leg variable (the at-risk leg). A missing phase falls back to the deepest
 * absorption frame, so a variable still measures when contact detection is
 * imperfect. Auto-measure is an ESTIMATE: confidence is capped (never "high" from
 * a single phone clip); low-precision variables (RSI at 30 fps) and low landmark
 * visibility are capped low. Pure — no DB, no model.
 */
import type { Bi, ExtractSpec, MovementTest, Severity } from "../registry";
import type { Confidence, ScreenFinding } from "../interpret";
import type { PoseFrame, Side } from "./landmarks";
import { pointVisible, sideIndices } from "./landmarks";
import { frontalKneeDeviation, kneeFlexionDeg, medioLateralSway, pelvicObliquityDeg, rsiFromPhases, segmentDropJump, shoulderObliquityDeg, trunkLeanDeg, type Phases } from "./geometry";

export type SideOption = Side | "both";
export type PoseView = "front" | "side" | "back" | "both";
export type PoseAnalysisOptions = { side?: SideOption; view?: PoseView };

export type AutoMeasure = {
  variableKey: string;
  leg: Side | null;
  value: number | null;
  severity: Severity;
  confidence: Confidence;
};

export type PoseAnalysisResult = {
  measures: AutoMeasure[];
  findings: ScreenFinding[];
  phases: Phases;
  frameCount: number;
  note: Bi;
};

const SEV_RANK: Record<Severity, number> = { ok: 0, mild: 1, moderate: 2, marked: 3 };

function toSeverity(value: number, bands: ExtractSpec["bands"]): Severity {
  if (bands.direction === "higher_worse") {
    if (value >= bands.marked) return "marked";
    if (value >= bands.moderate) return "moderate";
    return "ok";
  }
  if (value <= bands.marked) return "marked";
  if (value <= bands.moderate) return "moderate";
  return "ok";
}

/** The frame index for a phase, falling back to the deepest absorption frame (or
 *  the mid-clip frame) when the requested phase couldn't be segmented. */
function phaseIndex(phases: Phases, phase: ExtractSpec["phase"], frameCount: number): number | null {
  const direct =
    phase === "initial_contact" ? phases.initialContactIdx
    : phase === "takeoff" ? phases.takeoffIdx
    : phase === "landing" ? phases.landingIdx
    : phases.absorptionIdx;
  return direct ?? phases.absorptionIdx ?? phases.initialContactIdx ?? (frameCount ? Math.floor(frameCount / 2) : null);
}

const isPerLegKind = (k: ExtractSpec["kind"]) => k === "frontal_knee_valgus" || k === "knee_flexion";

export function analyzePose(test: MovementTest, frames: PoseFrame[], opts: PoseAnalysisOptions = {}): PoseAnalysisResult {
  const phases = segmentDropJump(frames);
  const side: SideOption = opts.side ?? "L";
  const view = opts.view ?? "both";
  const frameConf: Confidence = frames.length >= 20 ? "moderate" : "low";
  // A bilateral test (e.g. overhead squat) reads both knees and keeps the worse;
  // a per-leg test reads the captured leg (or both in "worse" mode).
  const legsToTry: Side[] = side === "both" || test.laterality !== "per_leg" ? ["L", "R"] : [side];

  const measures: AutoMeasure[] = [];
  for (const v of test.variables) {
    const ex = v.extract;
    if (!ex) continue;
    if (view !== "both" && ex.view !== view) continue; // a computation the clip's view can't support

    let value: number | null = null;
    let leg: Side | null = null;
    let lowVis = false;

    if (ex.kind === "rsi") {
      value = rsiFromPhases(frames, phases).rsi;
      leg = test.laterality === "per_leg" && side !== "both" ? side : null;
    } else if (ex.kind === "landing_sway") {
      value = medioLateralSway(frames, phases);
    } else if (ex.kind === "pelvic_drop") {
      const idx = phaseIndex(phases, ex.phase, frames.length);
      if (idx == null) continue;
      value = pelvicObliquityDeg(frames[idx]);
    } else if (ex.kind === "shoulder_obliquity") {
      const idx = phaseIndex(phases, ex.phase, frames.length);
      if (idx == null) continue;
      value = shoulderObliquityDeg(frames[idx]);
    } else if (ex.kind === "trunk_lean") {
      const idx = phaseIndex(phases, ex.phase, frames.length);
      if (idx == null) continue;
      value = trunkLeanDeg(frames[idx]);
    } else if (isPerLegKind(ex.kind)) {
      const idx = phaseIndex(phases, ex.phase, frames.length);
      if (idx == null) continue;
      const frame = frames[idx];
      // Compute for each candidate leg; keep the WORSE (higher severity) side.
      let best: { value: number; sev: Severity; leg: Side; lowVis: boolean } | null = null;
      for (const lg of legsToTry) {
        const val = ex.kind === "frontal_knee_valgus" ? frontalKneeDeviation(frame, lg) : kneeFlexionDeg(frame, lg);
        if (val == null) continue;
        const sev = toSeverity(val, ex.bands);
        const s = sideIndices(lg);
        const lv = !pointVisible(frame, s.knee) || !pointVisible(frame, s.ankle);
        if (!best || SEV_RANK[sev] > SEV_RANK[best.sev]) best = { value: val, sev, leg: lg, lowVis: lv };
      }
      if (!best) continue;
      value = best.value; lowVis = best.lowVis;
      // A per-leg test reports the worse leg; a bilateral test reports no leg.
      leg = test.laterality === "per_leg" ? best.leg : null;
    }

    if (value == null) continue;
    const rounded = Math.round(value * 1000) / 1000;
    let conf: Confidence = frameConf;
    if (v.reliability === "low_precision" || lowVis) conf = "low";
    measures.push({ variableKey: v.key, leg, value: rounded, severity: toSeverity(rounded, ex.bands), confidence: conf });
  }

  const findings: ScreenFinding[] = measures.map((m) => ({
    variableKey: m.variableKey,
    leg: m.leg,
    severity: m.severity,
    value: m.value,
  }));

  return {
    measures,
    findings,
    phases,
    frameCount: frames.length,
    note: {
      en: "Auto-measured estimate — confirm or override each finding before saving.",
      is: "Sjálfvirk mæling (áætlun) — staðfestu eða breyttu hverri niðurstöðu áður en vistað er.",
    },
  };
}

/**
 * Between-leg asymmetry from two per-leg captures. For each variable measured on
 * BOTH legs, if one leg is at least a band worse than the other AND that worse
 * leg is moderate+, we flag a left/right asymmetry on the worse side. Honest: no
 * dubious percentage — it fires only on a clear, band-level divergence (e.g. the
 * left knee collapses in valgus while the right stays clean), feeding the test's
 * limb-symmetry / return-to-play rule. Returns null unless both legs are present.
 */
export function legAsymmetryFinding(
  byLeg: { L?: AutoMeasure[]; R?: AutoMeasure[] },
): ScreenFinding | null {
  const L = byLeg.L, R = byLeg.R;
  if (!L?.length || !R?.length) return null;
  const lMap = new Map(L.map((m) => [m.variableKey, m] as const));
  const rMap = new Map(R.map((m) => [m.variableKey, m] as const));
  let worst: { sev: Severity; leg: Side } | null = null;
  for (const [key, lm] of lMap) {
    const rm = rMap.get(key);
    if (!rm) continue;
    const lS = SEV_RANK[lm.severity], rS = SEV_RANK[rm.severity];
    const gap = Math.abs(lS - rS);
    if (gap < 1 || Math.max(lS, rS) < 2) continue; // need a band gap AND a moderate+ side
    const leg: Side = lS > rS ? "L" : "R";
    const sev: Severity = gap >= 2 ? "marked" : "moderate";
    if (!worst || SEV_RANK[sev] > SEV_RANK[worst.sev]) worst = { sev, leg };
  }
  if (!worst) return null;
  return { variableKey: "lsi", leg: worst.leg, severity: worst.sev, value: null };
}
