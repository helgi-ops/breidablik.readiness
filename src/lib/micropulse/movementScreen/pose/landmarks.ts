/**
 * BlazePose (MediaPipe) landmark model — 33 normalised landmarks per frame.
 * Coordinates are image-normalised: x,y in [0,1] (y increases DOWNWARD), z
 * roughly in the same scale (depth), visibility in [0,1]. The pipeline is shared;
 * a test definition's `extract` specs say which of these to read and when.
 */

export type PoseLandmark = { x: number; y: number; z: number; visibility: number };
export type PoseFrame = { tMs: number; lm: PoseLandmark[] };

/** MediaPipe BlazePose landmark indices (subset used by the screen analysers). */
export const LM = {
  NOSE: 0,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32,
} as const;

export type Side = "L" | "R";

export type SideIndices = { shoulder: number; hip: number; knee: number; ankle: number; heel: number; foot: number };

export function sideIndices(side: Side): SideIndices {
  return side === "L"
    ? { shoulder: LM.LEFT_SHOULDER, hip: LM.LEFT_HIP, knee: LM.LEFT_KNEE, ankle: LM.LEFT_ANKLE, heel: LM.LEFT_HEEL, foot: LM.LEFT_FOOT_INDEX }
    : { shoulder: LM.RIGHT_SHOULDER, hip: LM.RIGHT_HIP, knee: LM.RIGHT_KNEE, ankle: LM.RIGHT_ANKLE, heel: LM.RIGHT_HEEL, foot: LM.RIGHT_FOOT_INDEX };
}

/** Minimum landmark visibility for a reading to be trusted. */
export const MIN_VISIBILITY = 0.5;

export function pointVisible(f: PoseFrame, idx: number): boolean {
  const p = f.lm[idx];
  return !!p && p.visibility >= MIN_VISIBILITY;
}
