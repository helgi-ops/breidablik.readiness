/**
 * Pure pose geometry + phase segmentation. Deterministic maths over BlazePose
 * frames — no DB, no model. The shared analyser (analyze.ts) drives these from a
 * test definition's extract specs. Kept pure so it is unit-testable on synthetic
 * frames (the browser pose extraction is the only non-deterministic part).
 */
import { LM, sideIndices, type PoseFrame, type Side } from "./landmarks";

const mid = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** Interior angle (deg) at b, formed by a-b-c in the image plane. */
export function angleDeg(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }): number {
  const v1x = a.x - b.x, v1y = a.y - b.y, v2x = c.x - b.x, v2y = c.y - b.y;
  const dot = v1x * v2x + v1y * v2y;
  const m = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y) || 1e-6;
  return (Math.acos(Math.max(-1, Math.min(1, dot / m))) * 180) / Math.PI;
}

/** Knee-flexion DEPTH (deg): 180 − interior knee angle. Higher = deeper flexion. */
export function kneeFlexionDeg(f: PoseFrame, side: Side): number | null {
  const s = sideIndices(side);
  const hip = f.lm[s.hip], knee = f.lm[s.knee], ankle = f.lm[s.ankle];
  if (!hip || !knee || !ankle) return null;
  return 180 - angleDeg(hip, knee, ankle);
}

/** Frontal-plane knee deviation ratio (valgus proxy): perpendicular distance of
 *  the knee from the hip→ankle line, normalised by limb length. 0 = knee tracks
 *  over the line; larger = more medial/lateral collapse (front view). */
export function frontalKneeDeviation(f: PoseFrame, side: Side): number | null {
  const s = sideIndices(side);
  const hip = f.lm[s.hip], knee = f.lm[s.knee], ankle = f.lm[s.ankle];
  if (!hip || !knee || !ankle) return null;
  const dx = ankle.x - hip.x, dy = ankle.y - hip.y;
  const len = Math.hypot(dx, dy) || 1e-6;
  const cross = Math.abs(dx * (knee.y - hip.y) - dy * (knee.x - hip.x));
  return cross / len / len; // perpendicular distance / limb length
}

/** Trunk lean from vertical (deg): hip-mid → shoulder-mid vector vs the upright. */
export function trunkLeanDeg(f: PoseFrame): number | null {
  const sl = f.lm[LM.LEFT_SHOULDER], sr = f.lm[LM.RIGHT_SHOULDER], hl = f.lm[LM.LEFT_HIP], hr = f.lm[LM.RIGHT_HIP];
  if (!sl || !sr || !hl || !hr) return null;
  const sMid = mid(sl, sr), hMid = mid(hl, hr);
  const vx = sMid.x - hMid.x, vy = sMid.y - hMid.y;
  return (Math.atan2(Math.abs(vx), Math.abs(vy) || 1e-6) * 180) / Math.PI;
}

/** Contralateral pelvic drop / obliquity (deg): tilt of the hip-to-hip line from
 *  horizontal (front view). ~0 = level pelvis; larger = the free-leg side of the
 *  pelvis drops (Trendelenburg) → stance-leg gluteus-medius control. */
export function pelvicObliquityDeg(f: PoseFrame): number | null {
  const hl = f.lm[LM.LEFT_HIP], hr = f.lm[LM.RIGHT_HIP];
  if (!hl || !hr) return null;
  const dx = hr.x - hl.x, dy = hr.y - hl.y;
  return (Math.atan2(Math.abs(dy), Math.abs(dx) || 1e-6) * 180) / Math.PI;
}

/** Shoulder-line obliquity (deg): tilt of the shoulder-to-shoulder line from
 *  horizontal (front/back view). ~0 = level; larger = one shoulder higher →
 *  scapular elevation / asymmetry. */
export function shoulderObliquityDeg(f: PoseFrame): number | null {
  const sl = f.lm[LM.LEFT_SHOULDER], sr = f.lm[LM.RIGHT_SHOULDER];
  if (!sl || !sr) return null;
  const dx = sr.x - sl.x, dy = sr.y - sl.y;
  return (Math.atan2(Math.abs(dy), Math.abs(dx) || 1e-6) * 180) / Math.PI;
}

/** Medio-lateral landing sway (front view): the side-to-side range of the CoM
 *  (hip-mid x) over the post-landing window, normalised by shoulder width so it
 *  is scale-invariant. Larger = more wobble / no "stuck" landing. */
export function medioLateralSway(frames: PoseFrame[], phases: Phases): number | null {
  const start = phases.landingIdx ?? phases.absorptionIdx ?? 0;
  const xs: number[] = [];
  let scaleSum = 0, scaleN = 0;
  for (let i = start; i < frames.length; i++) {
    const f = frames[i];
    const hl = f.lm[LM.LEFT_HIP], hr = f.lm[LM.RIGHT_HIP];
    if (!hl || !hr) continue;
    xs.push((hl.x + hr.x) / 2);
    const sl = f.lm[LM.LEFT_SHOULDER], sr = f.lm[LM.RIGHT_SHOULDER];
    if (sl && sr) { scaleSum += Math.hypot(sr.x - sl.x, sr.y - sl.y); scaleN++; }
  }
  if (xs.length < 3) return null;
  const range = Math.max(...xs) - Math.min(...xs);
  const shoulderW = scaleN ? scaleSum / scaleN : 0;
  return shoulderW > 1e-3 ? Math.round((range / shoulderW) * 1000) / 1000 : Math.round(range * 1000) / 1000;
}

/** Centre-of-mass vertical proxy: hip-mid y (image y increases downward, so a
 *  LARGER value means a LOWER body position). */
export function hipMidY(f: PoseFrame): number | null {
  const hl = f.lm[LM.LEFT_HIP], hr = f.lm[LM.RIGHT_HIP];
  if (!hl || !hr) return null;
  return (hl.y + hr.y) / 2;
}

export type Phases = {
  initialContactIdx: number | null;
  absorptionIdx: number | null;
  takeoffIdx: number | null;
  landingIdx: number | null;
};

/**
 * Best-effort drop-jump phase segmentation from the CoM (hip-mid y) trajectory.
 * absorption = deepest CoM (max y) in the early window; initial contact = fastest
 * downward frame just before it; takeoff = CoM apex (min y) after absorption;
 * landing = next CoM low after the apex. Heuristic — the analyser flags temporal
 * outputs (RSI/contact time) low-confidence.
 */
export function segmentDropJump(frames: PoseFrame[]): Phases {
  const empty: Phases = { initialContactIdx: null, absorptionIdx: null, takeoffIdx: null, landingIdx: null };
  const y = frames.map(hipMidY);
  const valid = y.map((v, i) => (v == null ? -1 : i)).filter((i) => i >= 0);
  if (valid.length < 5) return empty;

  const n = frames.length;
  const earlyEnd = Math.max(2, Math.floor(n * 0.6));
  // Absorption = deepest CoM (max y) in the early window.
  let absorptionIdx = valid[0];
  for (const i of valid) if (i < earlyEnd && (y[i] as number) > (y[absorptionIdx] as number)) absorptionIdx = i;

  // Initial contact = the frame before absorption with the greatest downward
  // velocity (largest positive Δy).
  let initialContactIdx: number | null = null;
  let maxDown = -Infinity;
  for (let i = 1; i <= absorptionIdx; i++) {
    if (y[i] == null || y[i - 1] == null) continue;
    const v = (y[i] as number) - (y[i - 1] as number);
    if (v > maxDown) { maxDown = v; initialContactIdx = i; }
  }

  // Takeoff = CoM apex (min y) after absorption.
  let takeoffIdx: number | null = null;
  for (let i = absorptionIdx + 1; i < n; i++) {
    if (y[i] == null) continue;
    if (takeoffIdx == null || (y[i] as number) < (y[takeoffIdx] as number)) takeoffIdx = i;
  }

  // Landing = next CoM low (max y) after the apex.
  let landingIdx: number | null = null;
  if (takeoffIdx != null) {
    for (let i = takeoffIdx + 1; i < n; i++) {
      if (y[i] == null) continue;
      if (landingIdx == null || (y[i] as number) > (y[landingIdx] as number)) landingIdx = i;
    }
  }

  return { initialContactIdx, absorptionIdx, takeoffIdx, landingIdx };
}

/** Reactive strength index (rough): flight time / contact time from the phases.
 *  Low precision at 30 fps (~33 ms) — the analyser caps its confidence. */
export function rsiFromPhases(frames: PoseFrame[], phases: Phases): { rsi: number | null; contactMs: number | null; flightMs: number | null } {
  const { initialContactIdx, takeoffIdx, landingIdx } = phases;
  if (initialContactIdx == null || takeoffIdx == null || landingIdx == null) return { rsi: null, contactMs: null, flightMs: null };
  const contactMs = frames[takeoffIdx].tMs - frames[initialContactIdx].tMs;
  const flightMs = frames[landingIdx].tMs - frames[takeoffIdx].tMs;
  if (contactMs <= 0 || flightMs <= 0) return { rsi: null, contactMs, flightMs };
  return { rsi: Math.round((flightMs / contactMs) * 100) / 100, contactMs, flightMs };
}
