import { describe, it, expect } from "vitest";
import type { PoseFrame, PoseLandmark } from "../landmarks";
import { LM } from "../landmarks";
import { angleDeg, frontalKneeDeviation, kneeFlexionDeg, trunkLeanDeg, segmentDropJump, rsiFromPhases, pelvicObliquityDeg, medioLateralSway, type Phases } from "../geometry";
import { analyzePose } from "../analyze";
import { SEED_MOVEMENT_TESTS } from "../../registry";

const SLDJ = SEED_MOVEMENT_TESTS.find((t) => t.slug === "single_leg_drop_jump")!;

function blankLm(): PoseLandmark[] {
  return Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 }));
}
function mkFrame(tMs: number, hipY: number, kneeOffX = 0): PoseFrame {
  const lm = blankLm();
  const set = (i: number, x: number, y: number) => { lm[i] = { x, y, z: 0, visibility: 1 }; };
  set(LM.LEFT_SHOULDER, 0.48, hipY - 0.2); set(LM.RIGHT_SHOULDER, 0.52, hipY - 0.2);
  set(LM.LEFT_HIP, 0.48, hipY); set(LM.RIGHT_HIP, 0.52, hipY);
  set(LM.LEFT_KNEE, 0.48 + kneeOffX, hipY + 0.2); set(LM.RIGHT_KNEE, 0.52, hipY + 0.2);
  set(LM.LEFT_ANKLE, 0.48, hipY + 0.4); set(LM.RIGHT_ANKLE, 0.52, hipY + 0.4);
  return { tMs, lm };
}

describe("pose geometry", () => {
  it("angleDeg: a right angle is 90°", () => {
    expect(Math.round(angleDeg({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 1 }))).toBe(90);
  });

  it("kneeFlexionDeg: a straight leg ≈ 0, a bent leg > 0", () => {
    const straight = mkFrame(0, 0.4, 0);
    expect(kneeFlexionDeg(straight, "L")!).toBeLessThan(2);
    const bent: PoseFrame = { tMs: 0, lm: blankLm() };
    bent.lm[LM.LEFT_HIP] = { x: 0.5, y: 0.4, z: 0, visibility: 1 };
    bent.lm[LM.LEFT_KNEE] = { x: 0.5, y: 0.6, z: 0, visibility: 1 };
    bent.lm[LM.LEFT_ANKLE] = { x: 0.65, y: 0.7, z: 0, visibility: 1 };
    expect(kneeFlexionDeg(bent, "L")!).toBeGreaterThan(20);
  });

  it("frontalKneeDeviation: knee on the hip–ankle line ≈ 0, offset knee > 0", () => {
    expect(frontalKneeDeviation(mkFrame(0, 0.4, 0), "L")!).toBeLessThan(0.01);
    expect(frontalKneeDeviation(mkFrame(0, 0.4, 0.06), "L")!).toBeGreaterThan(0.1);
  });

  it("trunkLeanDeg: upright ≈ 0, leaning > 0", () => {
    expect(trunkLeanDeg(mkFrame(0, 0.4, 0))!).toBeLessThan(2);
    const lean: PoseFrame = { tMs: 0, lm: blankLm() };
    lean.lm[LM.LEFT_SHOULDER] = { x: 0.6, y: 0.2, z: 0, visibility: 1 };
    lean.lm[LM.RIGHT_SHOULDER] = { x: 0.64, y: 0.2, z: 0, visibility: 1 };
    lean.lm[LM.LEFT_HIP] = { x: 0.48, y: 0.4, z: 0, visibility: 1 };
    lean.lm[LM.RIGHT_HIP] = { x: 0.52, y: 0.4, z: 0, visibility: 1 };
    expect(trunkLeanDeg(lean)!).toBeGreaterThan(15);
  });

  it("pelvicObliquityDeg: level pelvis ≈ 0, a dropped pelvis is large", () => {
    expect(pelvicObliquityDeg(mkFrame(0, 0.4, 0))!).toBeLessThan(2); // hips level in mkFrame
    const tilted: PoseFrame = { tMs: 0, lm: blankLm() };
    tilted.lm[LM.LEFT_HIP] = { x: 0.45, y: 0.40, z: 0, visibility: 1 };
    tilted.lm[LM.RIGHT_HIP] = { x: 0.55, y: 0.50, z: 0, visibility: 1 };
    expect(pelvicObliquityDeg(tilted)!).toBeGreaterThan(10);
  });

  it("medioLateralSway: a still landing ≈ 0, a wobbling one > 0", () => {
    const phases: Phases = { initialContactIdx: 0, absorptionIdx: 0, takeoffIdx: 0, landingIdx: 0 };
    const still = [0, 1, 2, 3].map((i) => mkFrame(i * 33, 0.5, 0));
    expect(medioLateralSway(still, phases)!).toBeLessThan(0.02);
    // Wide shoulders (scale) + a hip-mid that swings side to side after landing.
    const wobble: PoseFrame[] = [0.46, 0.54, 0.44, 0.56].map((mx, i) => {
      const f = mkFrame(i * 33, 0.5, 0);
      f.lm[LM.LEFT_SHOULDER] = { x: 0.35, y: 0.3, z: 0, visibility: 1 };
      f.lm[LM.RIGHT_SHOULDER] = { x: 0.65, y: 0.3, z: 0, visibility: 1 };
      f.lm[LM.LEFT_HIP] = { x: mx - 0.02, y: 0.5, z: 0, visibility: 1 };
      f.lm[LM.RIGHT_HIP] = { x: mx + 0.02, y: 0.5, z: 0, visibility: 1 };
      return f;
    });
    expect(medioLateralSway(wobble, phases)!).toBeGreaterThan(0.15);
  });

  it("segmentDropJump: finds absorption (deepest), takeoff (apex), landing", () => {
    const ys = [0.30, 0.40, 0.55, 0.60, 0.52, 0.42, 0.28, 0.40, 0.56];
    const frames = ys.map((y, i) => mkFrame(i * 33, y));
    const p = segmentDropJump(frames);
    expect(p.absorptionIdx).toBe(3);
    expect(p.initialContactIdx).toBe(2);
    expect(p.takeoffIdx).toBe(6);
    expect(p.landingIdx).toBe(8);
    const { rsi, contactMs, flightMs } = rsiFromPhases(frames, p);
    expect(contactMs).toBe(132);
    expect(flightMs).toBe(66);
    expect(rsi).toBeCloseTo(0.5, 2);
  });
});

describe("analyzePose", () => {
  it("auto-measures the front-view valgus and grades it, per leg", () => {
    // A drop-jump CoM trajectory with a constant left-knee valgus offset.
    const ys = [0.30, 0.40, 0.55, 0.60, 0.52, 0.42, 0.28, 0.40, 0.56];
    const frames = ys.map((y, i) => mkFrame(i * 33, y, 0.06));
    const res = analyzePose(SLDJ, frames, { side: "L", view: "front" });
    const valgus = res.measures.find((m) => m.variableKey === "knee_valgus_contact");
    expect(valgus).toBeTruthy();
    expect(valgus!.leg).toBe("L");
    expect(valgus!.value!).toBeGreaterThan(0.1);
    expect(valgus!.severity).toBe("marked");
    // Front view → the side-only knee-flexion variable is not measured here.
    expect(res.measures.some((m) => m.variableKey === "knee_flexion_absorption")).toBe(false);
    // Pre-filled findings mirror the measures (coach then confirms/overrides).
    expect(res.findings.some((f) => f.variableKey === "knee_valgus_contact" && f.severity === "marked")).toBe(true);
    // Auto-measure is never surfaced as "high" confidence from a single clip.
    expect(valgus!.confidence).not.toBe("high");
  });

  it("a front clip reads the whole frontal plane (valgus contact + peak, pelvic drop, trunk, sway) but no sagittal variables", () => {
    // …drop, absorb, re-jump, then a held landing (frames after touchdown feed sway).
    const ys = [0.30, 0.40, 0.55, 0.60, 0.52, 0.42, 0.28, 0.40, 0.56, 0.55, 0.55, 0.55];
    const frames = ys.map((y, i) => mkFrame(i * 33, y, 0.06));
    const res = analyzePose(SLDJ, frames, { side: "L", view: "front" });
    const keys = new Set(res.measures.map((m) => m.variableKey));
    for (const k of ["knee_valgus_contact", "knee_valgus_absorption", "pelvic_drop", "trunk_lean_frontal", "landing_sway"]) {
      expect(keys.has(k)).toBe(true);
    }
    // Side-only (sagittal) variables need a side clip.
    expect(keys.has("knee_flexion_absorption")).toBe(false);
    expect(keys.has("rsi")).toBe(false);
    // Valgus fires at BOTH contact and peak absorption with the constant offset.
    expect(res.measures.find((m) => m.variableKey === "knee_valgus_absorption")!.severity).toBe("marked");
  });

  it("side 'both' keeps the worse leg (here L has the valgus offset)", () => {
    const ys = [0.30, 0.40, 0.55, 0.60, 0.52, 0.42, 0.28, 0.40, 0.56];
    const frames = ys.map((y, i) => mkFrame(i * 33, y, 0.06)); // only the LEFT knee is offset
    const res = analyzePose(SLDJ, frames, { side: "both", view: "front" });
    const valgus = res.measures.find((m) => m.variableKey === "knee_valgus_contact")!;
    expect(valgus.leg).toBe("L");
    expect(valgus.severity).toBe("marked");
  });
});
