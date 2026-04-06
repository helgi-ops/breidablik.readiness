import type { NeuralLoadInput, NextDayRisk, NeuralLoadState, ReadinessTrajectory } from "@/lib/neuralLoad/types";

export function classifyReadinessTrajectory(input: Pick<NeuralLoadInput, "zHistory" | "z" | "zPrev" | "deltaZ">): ReadinessTrajectory {
  const hist = Array.isArray(input.zHistory)
    ? input.zHistory.filter((v): v is number => typeof v === "number" && Number.isFinite(v))
    : [];

  if (hist.length >= 3) {
    const a = hist[hist.length - 3];
    const b = hist[hist.length - 2];
    const c = hist[hist.length - 1];

    const d1 = b - a;
    const d2 = c - b;

    if (d1 <= -0.15 && d2 <= -0.15) return "DECLINING";
    if (d1 >= 0.15 && d2 >= 0.15) return "IMPROVING";
    return "FLAT";
  }

  const dz = typeof input.deltaZ === "number" ? input.deltaZ : null;
  if (dz != null) {
    if (dz <= -0.25) return "DECLINING";
    if (dz >= 0.25) return "IMPROVING";
  }

  if (typeof input.z === "number" && typeof input.zPrev === "number") {
    const d = input.z - input.zPrev;
    if (d <= -0.25) return "DECLINING";
    if (d >= 0.25) return "IMPROVING";
  }

  return "FLAT";
}

export function predictNextDayRisk(input: {
  neuralLoadState: NeuralLoadState;
  trajectory: ReadinessTrajectory;
  source: Pick<NeuralLoadInput, "hsrHighYesterday" | "maxVelocityHighYesterday" | "scheduleCongestion" | "travelFlag" | "lowStenDays" | "fatigue">;
}): { risk: NextDayRisk; riskScore: number } {
  let score = 0;

  if (input.neuralLoadState === "CRITICAL") score += 3;
  else if (input.neuralLoadState === "HIGH") score += 2;
  else if (input.neuralLoadState === "RISING") score += 1;

  if (input.trajectory === "DECLINING") score += 2;
  else if (input.trajectory === "FLAT") score += 1;

  if (input.source.hsrHighYesterday) score += 1;
  if (input.source.maxVelocityHighYesterday) score += 1;
  if (input.source.scheduleCongestion) score += 1;
  if (input.source.travelFlag) score += 1;
  if ((input.source.lowStenDays ?? 0) >= 2) score += 1;

  const fatigueType = String(input.source.fatigue?.primaryFatigueType ?? "NONE").toUpperCase();
  const fatigueSeverity = String(input.source.fatigue?.severity ?? "LOW").toUpperCase();
  if (fatigueType === "NEURAL") score += 2;
  if (fatigueType === "SYSTEMIC" && fatigueSeverity === "HIGH") score += 2;
  else if (fatigueType === "SYSTEMIC" && fatigueSeverity === "MODERATE") score += 1;

  let risk: NextDayRisk = "LOW";
  if (score >= 6) risk = "HIGH";
  else if (score >= 3) risk = "MODERATE";

  return { risk, riskScore: score };
}
