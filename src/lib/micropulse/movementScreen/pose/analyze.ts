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
import { frontalKneeDeviation, kneeFlexionDeg, rsiFromPhases, segmentDropJump, trunkLeanDeg, type Phases } from "./geometry";

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
  const legsToTry: Side[] = side === "both" ? ["L", "R"] : [side];

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
      value = best.value; leg = best.leg; lowVis = best.lowVis;
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
