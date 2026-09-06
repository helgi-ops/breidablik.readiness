/**
 * Shared pose analyser. Given a test definition and the pose frames, it reads the
 * variables' `extract` specs to know which angles/phases to compute, segments the
 * movement once, samples each variable at its phase, and maps the computed value
 * to a severity band — producing pre-filled findings the coach confirms/overrides.
 *
 * Auto-measure is an ESTIMATE: confidence is capped (never "high" from a single
 * phone clip) and low-precision variables (RSI at 30 fps) are capped low. Pure —
 * no DB, no model; the browser pose extraction feeds it frames.
 */
import type { Bi, ExtractSpec, MovementTest, Severity } from "../registry";
import type { Confidence, ScreenFinding } from "../interpret";
import type { PoseFrame, Side } from "./landmarks";
import { pointVisible, sideIndices } from "./landmarks";
import { frontalKneeDeviation, kneeFlexionDeg, rsiFromPhases, segmentDropJump, trunkLeanDeg, type Phases } from "./geometry";

export type PoseAnalysisOptions = { side?: Side; view?: "front" | "side" | "both" };

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

function phaseIndex(phases: Phases, phase: ExtractSpec["phase"]): number | null {
  switch (phase) {
    case "initial_contact": return phases.initialContactIdx;
    case "absorption": return phases.absorptionIdx;
    case "takeoff": return phases.takeoffIdx;
    case "landing": return phases.landingIdx;
    default: return phases.absorptionIdx ?? phases.initialContactIdx;
  }
}

export function analyzePose(test: MovementTest, frames: PoseFrame[], opts: PoseAnalysisOptions = {}): PoseAnalysisResult {
  const phases = segmentDropJump(frames);
  const side: Side = opts.side ?? "L";
  const view = opts.view ?? "both";
  const frameConf: Confidence = frames.length >= 20 ? "moderate" : "low";

  const measures: AutoMeasure[] = [];
  for (const v of test.variables) {
    const ex = v.extract;
    if (!ex) continue;
    // Skip a computation the clip's view can't support.
    if (view !== "both" && ex.view !== view) continue;

    let value: number | null = null;
    let lowVis = false;
    if (ex.kind === "rsi") {
      value = rsiFromPhases(frames, phases).rsi;
    } else {
      const idx = phaseIndex(phases, ex.phase);
      if (idx == null) continue;
      const frame = frames[idx];
      if (ex.kind === "frontal_knee_valgus") value = frontalKneeDeviation(frame, side);
      else if (ex.kind === "knee_flexion") value = kneeFlexionDeg(frame, side);
      else if (ex.kind === "trunk_lean") value = trunkLeanDeg(frame);
      // Down-weight when the key landmark isn't clearly visible at the sampled frame.
      if (ex.kind === "frontal_knee_valgus" || ex.kind === "knee_flexion") {
        const s = sideIndices(side);
        lowVis = !pointVisible(frame, s.knee) || !pointVisible(frame, s.ankle);
      }
    }
    if (value == null) continue;

    const rounded = Math.round(value * 1000) / 1000;
    const severity = toSeverity(rounded, ex.bands);
    let conf: Confidence = frameConf;
    if (v.reliability === "low_precision" || lowVis) conf = "low";
    measures.push({ variableKey: v.key, leg: test.laterality === "per_leg" ? side : null, value: rounded, severity, confidence: conf });
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
