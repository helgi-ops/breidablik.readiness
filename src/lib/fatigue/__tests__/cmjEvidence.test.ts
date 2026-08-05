import { describe, it, expect } from "vitest";
import { classifyFatigue } from "../classify";
import { deriveCmjFatigueEvidence, cmjEvidenceFromValdSnapshot, buildNeuromuscularFatigueRead } from "../cmjEvidence";
import type { FatigueInput } from "../types";
import { classifyPhaseChange, type PhaseMetricKey } from "@/lib/micropulse/vald/phaseChange";
import type { ValdDailySnapshot } from "@/lib/micropulse/vald/types";

/** A minimal serialized VALD snapshot carrying one CV-gated phase metric. */
function snapshotWith(metricRows: Array<Record<string, unknown>>, available = true): ValdDailySnapshot {
  return {
    explanation: { cmj: { phase: { available, metrics: metricRows } } },
  } as unknown as ValdDailySnapshot;
}
const REAL_PEAKPOWER_DROP = {
  metric: "peakPower",
  status: "real",
  worse: true,
  delta_percent: -10,
  threshold_percent: 4.05,
  label: { en: "peak power is down vs usual — and beyond measurement noise", is: "hámarksafl er lægra en venjulega — og það er umfram mæliskekkju" },
};

/** A phase-change result for one metric: latest vs a flat baseline window. */
function phase(metric: PhaseMetricKey, latest: number | null, baselineValues: number[]) {
  return classifyPhaseChange({ metric, latest, baselineValues });
}

/** A neutral FatigueInput that on its own produces NO drivers (type NONE). */
function baseInput(overrides: Partial<FatigueInput> = {}): FatigueInput {
  return {
    playerId: "p1",
    energy: 3,
    sleepQuality: 3,
    sleepDuration: 3,
    stress: 0,
    soreness: 3,
    totalScore: 20,
    sten: 10,
    zReadiness: 0,
    deltaZ: 0,
    lowStenDays: 0,
    poorWellnessCount: null,
    hsrHighYesterday: false,
    accelHighYesterday: false,
    decelHighYesterday: false,
    totalDistanceHighYesterday: false,
    intensityHighYesterday: false,
    matchMinutesHigh: false,
    matchMinutesPlayed: null,
    scheduleCongestion: false,
    travelFlag: false,
    hasPainFlag: false,
    painLocation: null,
    repeatedSameComplaint: false,
    localComplaintMatchesLoad: false,
    mdDay: null,
    teamVolatilityHigh: false,
    hasWellnessData: true,
    hasLoadData: true,
    ...overrides,
  };
}

describe("deriveCmjFatigueEvidence (CV-gated mapper)", () => {
  it("routes a CV-cleared peak-power drop to the NEURAL axis, cited", () => {
    const ev = deriveCmjFatigueEvidence({
      phaseResults: [phase("peakPower", 4500, [5000, 5000, 5000])], // -10%, > 4.05% floor
    });
    expect(ev.hasData).toBe(true);
    expect(ev.neuralDrivers).toHaveLength(1);
    expect(ev.tissueDrivers).toHaveLength(0);
    expect(ev.neuralDrivers[0].metric).toBe("peakPower");
    expect(ev.neuralDrivers[0].citation).toMatch(/Gathercole|D'Emanuele/);
    expect(ev.neuralDrivers[0].labelIs.length).toBeGreaterThan(0);
  });

  it("routes a CV-cleared eccentric lengthening + slow rebound to the TISSUE axis", () => {
    const ev = deriveCmjFatigueEvidence({
      phaseResults: [phase("eccentricDuration", 360, [300, 300, 300])], // +20%, > 12% floor
      recoverySlope: "slow",
    });
    expect(ev.tissueDrivers.map((d) => d.metric)).toEqual(
      expect.arrayContaining(["eccentricDuration", "recoverySlope"]),
    );
    expect(ev.neuralDrivers).toHaveLength(0);
  });

  it("a within-noise wobble creates NO driver (the CV gate holds)", () => {
    const ev = deriveCmjFatigueEvidence({
      phaseResults: [phase("peakPower", 4950, [5000, 5000, 5000])], // -1%, under noise floor
    });
    expect(ev.hasData).toBe(true);
    expect(ev.neuralDrivers).toHaveLength(0);
    expect(ev.tissueDrivers).toHaveLength(0);
  });

  it("no baseline → hasData false, no drivers (never a silent zero)", () => {
    const ev = deriveCmjFatigueEvidence({ phaseResults: [phase("peakPower", 4500, [])] });
    expect(ev.hasData).toBe(false);
    expect(ev.neuralDrivers).toHaveLength(0);
  });
});

describe("classifyFatigue with measured CMJ evidence", () => {
  it("NEURAL: a real peak-power drop makes NEURAL the primary type, as a cited driver", () => {
    const cmj = deriveCmjFatigueEvidence({
      phaseResults: [phase("peakPower", 4500, [5000, 5000, 5000])],
    });
    const res = classifyFatigue(baseInput({ cmj }));
    expect(res.primaryFatigueType).toBe("NEURAL");
    expect(res.neuralScore).toBe(2);
    const driver = res.drivers.find((d) => d.code === "CMJ_NEURAL_peakPower");
    expect(driver).toBeDefined();
    expect(driver?.category).toBe("NEURAL");
    expect(driver?.metric).toBe("peakPower");
    expect(driver?.citation).toBeTruthy();
  });

  it("TISSUE: an eccentric lengthening + slow rebound makes TISSUE the primary type", () => {
    const cmj = deriveCmjFatigueEvidence({
      phaseResults: [phase("eccentricDuration", 360, [300, 300, 300])],
      recoverySlope: "slow",
    });
    const res = classifyFatigue(baseInput({ cmj }));
    expect(res.primaryFatigueType).toBe("TISSUE");
    expect(res.tissueScore).toBe(4); // eccentric +2, slow rebound +2
    expect(res.drivers.some((d) => d.code === "CMJ_TISSUE_eccentricDuration")).toBe(true);
    expect(res.drivers.some((d) => d.code === "CMJ_RECOVERY_SLOW")).toBe(true);
  });

  it("no recent CMJ lowers confidence but never invents fatigue (no-data ≠ zero)", () => {
    // Base case with a real neural signal + one missing input → completeness 4/5,
    // gap ≥ 2 → HIGH confidence.
    const withEnergyDrop = baseInput({ energy: 1, hasLoadData: false });
    const withoutCmj = classifyFatigue(withEnergyDrop);
    expect(withoutCmj.confidence).toBe("HIGH");

    // Same player on a VALD team with NO recent jump: hasData=false lowers
    // completeness (4/6) → confidence drops, and it adds zero drivers.
    const withEmptyCmj = classifyFatigue({
      ...withEnergyDrop,
      cmj: { hasData: false, neuralDrivers: [], tissueDrivers: [], recoverySlope: "unknown" },
    });
    expect(withEmptyCmj.confidence).not.toBe("HIGH");
    expect(withEmptyCmj.drivers.some((d) => d.code.startsWith("CMJ_"))).toBe(false);
    // The fatigue verdict itself is unchanged — missing jump never zeroes it out.
    expect(withEmptyCmj.primaryFatigueType).toBe(withoutCmj.primaryFatigueType);
    expect(withEmptyCmj.neuralScore).toBe(withoutCmj.neuralScore);
  });
});

describe("cmjEvidenceFromValdSnapshot (serialized snapshot adapter)", () => {
  it("reads a serialized real peak-power drop onto the NEURAL axis", () => {
    const ev = cmjEvidenceFromValdSnapshot(snapshotWith([REAL_PEAKPOWER_DROP]));
    expect(ev).toBeDefined();
    expect(ev!.hasData).toBe(true);
    expect(ev!.neuralDrivers.map((d) => d.metric)).toContain("peakPower");
  });

  it("null snapshot → undefined (non-VALD player, confidence unaffected)", () => {
    expect(cmjEvidenceFromValdSnapshot(null)).toBeUndefined();
  });

  it("phase available but no real move → hasData true, no drivers", () => {
    const noise = { ...REAL_PEAKPOWER_DROP, status: "noise", worse: false, delta_percent: -1 };
    const ev = cmjEvidenceFromValdSnapshot(snapshotWith([noise]));
    expect(ev!.hasData).toBe(true);
    expect(ev!.neuralDrivers).toHaveLength(0);
    expect(ev!.tissueDrivers).toHaveLength(0);
  });
});

describe("buildNeuromuscularFatigueRead (decision-response builder)", () => {
  const neutralWellness = {
    playerId: "p1",
    energy: 3,
    sleepQuality: 3,
    soreness: 3,
    totalScore: 20,
    zReadiness: 0,
    deltaZ: 0,
    mdDay: null,
    intensity: null,
    hsrM: null,
    hasLoadData: true,
  };

  it("a measured CMJ peak-power drop yields a NEURAL read flagged usedCmj", () => {
    const read = buildNeuromuscularFatigueRead({
      ...neutralWellness,
      valdSnapshot: snapshotWith([REAL_PEAKPOWER_DROP]),
    });
    expect(read).not.toBeNull();
    expect(read!.primaryType).toBe("NEURAL");
    expect(read!.usedCmj).toBe(true);
    expect(read!.drivers.some((d) => d.metric === "peakPower" && d.category === "NEURAL")).toBe(true);
  });

  it("no fatigue signal and no CMJ → null (keeps the response lean)", () => {
    const read = buildNeuromuscularFatigueRead({ ...neutralWellness, valdSnapshot: null });
    expect(read).toBeNull();
  });
});
