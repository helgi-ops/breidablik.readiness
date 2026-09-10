/**
 * Measurement interface — the thin seam between the movement screen and whatever
 * produces its numbers. Today there is ONE provider: MediaPipe 2D (BlazePose,
 * in-browser). Everything downstream — the severity thresholds, the rule engine,
 * the `findings[]` shape, the corrective plan / rehab track / deficit ledger —
 * sits behind this seam, so the pose library can be swapped or upgraded without
 * touching them. Each measured variable carries its `method` (provenance) so a
 * pose-measured finding always outranks a Claude-vision estimate.
 *
 * Deliberately 2D + client-side: it fits a small-staff club filming one squat on
 * one phone (no calibration, no upload, free) and keeps the privacy stance — raw
 * video never leaves the device; only the derived numbers are stored. A lab-grade
 * multi-camera 3D pipeline is explicitly out of scope. This is a one-file seam,
 * not a second implementation.
 */
import type { MovementTest } from "../registry";
import type { PoseFrame } from "../pose/landmarks";
import { analyzePose, type AutoMeasure, type PoseAnalysisOptions } from "../pose/analyze";
import type { MeasurementMethod, PoseQuality, ScreenFinding } from "../interpret";

export type { MeasurementMethod } from "../interpret";

/** A measured variable = the pose estimate + its provenance. */
export type MeasuredVariable = AutoMeasure & {
  method: MeasurementMethod;
  captureQuality: PoseQuality;
};

export type MeasurementProvider = {
  id: MeasurementMethod;
  /** Measure a test's variables from the pose frames of ONE clip. Pure — no DB. */
  measure(test: MovementTest, frames: PoseFrame[], opts?: PoseAnalysisOptions): MeasuredVariable[];
};

/** Capture quality from frame count + whether any measure hit low landmark
 *  visibility — feeds the finding's provenance + the screen confidence. */
function captureQualityFrom(frameCount: number, measures: AutoMeasure[]): PoseQuality {
  const anyLow = measures.some((m) => m.confidence === "low");
  if (frameCount >= 20 && !anyLow) return "good";
  if (frameCount >= 8) return "fair";
  return "poor";
}

/** MediaPipe 2D (BlazePose, in-browser) — the only provider today. */
export const mediapipe2dProvider: MeasurementProvider = {
  id: "mediapipe_2d",
  measure(test, frames, opts) {
    const res = analyzePose(test, frames, opts);
    const captureQuality = captureQualityFrom(res.frameCount, res.measures);
    return res.measures.map((m) => ({ ...m, method: "mediapipe_2d" as const, captureQuality }));
  },
};

/** Serialize a measured variable into a persisted finding (carries provenance). */
export function measuredToFinding(m: MeasuredVariable): ScreenFinding {
  return {
    variableKey: m.variableKey,
    leg: m.leg,
    severity: m.severity,
    value: m.value,
    method: m.method,
    measuredConfidence: m.confidence,
    captureQuality: m.captureQuality,
  };
}
