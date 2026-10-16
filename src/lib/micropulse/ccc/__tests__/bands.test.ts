import { describe, it, expect } from "vitest";
import type { MatchUnit, MatchUnitMetric } from "@/lib/micropulse/periodization";
import { computeCccRead, type CccReadInput } from "../bands";
import { CCC_PHASE_BY_KEY } from "../continuum";

const m = (typical: number | null, peak: number | null = null): MatchUnitMetric => ({ typical, peak });
const NIL = m(null);

function matchUnit(over: Partial<MatchUnit>): MatchUnit {
  return {
    nNearFull: 6, nInWindow: 6, fellBack: false, confidence: "high",
    windowNote: { en: "", is: "" }, minutesTypical: 90,
    load: NIL, hsr: NIL, sprint: NIL, distance: NIL, accel: NIL, decel: NIL,
    accHiEff: NIL, decHiEff: NIL, stride: NIL, rhie: NIL, symmetry: NIL, metPower: NIL,
    ...over,
  };
}

const baseInput = (over: Partial<CccReadInput>): CccReadInput => ({
  phaseKey: "moderate_control",
  matchUnit: matchUnit({ distance: m(10000), hsr: m(600), sprint: m(200), accHiEff: m(40), decHiEff: m(40) }),
  recentActual: {},
  injuryCategory: "hamstring",
  gateValues: {},
  hasGps: true,
  hasForcePlate: true,
  ...over,
});

describe("computeCccRead — bands", () => {
  it("turns a phase band % into an absolute target off the player's own game load", () => {
    const r = computeCccRead(baseInput({ phaseKey: "high_control", recentActual: { distance: 4000 } }));
    expect(r.quantitative).toBe(true);
    const dist = r.bands.find((b) => b.variable === "distance")!;
    // high_control distance band = 0.3–0.5 of a 10000 m game
    expect(dist.targetLow).toBe(3000);
    expect(dist.targetHigh).toBe(5000);
    expect(dist.status).toBe("on"); // 4000 within [3000,5000]
    expect(dist.pctOfGame).toBe(40);
  });

  it("flags under / over the band", () => {
    const under = computeCccRead(baseInput({ phaseKey: "high_control", recentActual: { distance: 2000 } }));
    expect(under.bands.find((b) => b.variable === "distance")!.status).toBe("under");
    const over = computeCccRead(baseInput({ phaseKey: "high_control", recentActual: { distance: 9000 } }));
    expect(over.bands.find((b) => b.variable === "distance")!.status).toBe("over");
  });

  it("GPS gate: no GPS → qualitative only (no bands)", () => {
    const r = computeCccRead(baseInput({ hasGps: false }));
    expect(r.quantitative).toBe(false);
    expect(r.bands).toHaveLength(0);
    // phase + considerations still present
    expect(r.phase.key).toBe("moderate_control");
    expect(r.consideration.primary.length).toBeGreaterThan(0);
  });

  it("falls back to qualitative when the match-unit baseline is missing", () => {
    const r = computeCccRead(baseInput({ matchUnit: null }));
    expect(r.quantitative).toBe(false);
    expect(r.bands).toHaveLength(0);
  });
});

describe("computeCccRead — exit-criteria gate", () => {
  it("evaluates force-plate criteria against the numbers (met / not)", () => {
    // moderate_chaos requires CMJ asym <10, IMTP LSI ≥90, hop RSI LSI ≥90 (+ load tolerance)
    const r = computeCccRead(baseInput({
      phaseKey: "moderate_chaos",
      recentActual: { distance: 9000, hsr: 300, sprint: 60, accel: 30, decel: 30 }, // reaches the floors
      gateValues: { cmj_asymmetry_pct: 7, imtp_lsi_pct: 94, hop_rsi_lsi_pct: 92 },
    }));
    const cmj = r.gate.criteria.find((c) => c.key === "cmj_asymmetry_pct")!;
    expect(cmj.met).toBe(true);
    expect(cmj.value).toBe(7);
    expect(r.gate.allMet).toBe(true);
  });

  it("fails a criterion whose number is over threshold", () => {
    const r = computeCccRead(baseInput({
      phaseKey: "moderate_chaos",
      recentActual: { distance: 9000, hsr: 300, sprint: 60, accel: 30, decel: 30 },
      gateValues: { cmj_asymmetry_pct: 14, imtp_lsi_pct: 94, hop_rsi_lsi_pct: 92 },
    }));
    expect(r.gate.criteria.find((c) => c.key === "cmj_asymmetry_pct")!.met).toBe(false);
    expect(r.gate.allMet).toBe(false);
  });

  it("no force-plate → criteria show as unavailable (met=null, not false)", () => {
    const r = computeCccRead(baseInput({ phaseKey: "moderate_chaos", hasForcePlate: false, gateValues: {} }));
    const forcePlate = r.gate.criteria.filter((c) => c.key !== "load_tolerance");
    expect(forcePlate.every((c) => c.met === null)).toBe(true);
    expect(r.gate.allMet).toBe(false);
  });

  it("load_tolerance is met only when recent load reaches every introduced band floor", () => {
    const notReached = computeCccRead(baseInput({ phaseKey: "high_control", recentActual: { distance: 1000 } }));
    expect(notReached.gate.criteria.find((c) => c.key === "load_tolerance")!.met).toBe(false);
    const reached = computeCccRead(baseInput({ phaseKey: "high_control", recentActual: { distance: 4000, hsr: 500, accel: 30, decel: 30 } }));
    expect(reached.gate.criteria.find((c) => c.key === "load_tolerance")!.met).toBe(true);
  });

  it("knows the next phase", () => {
    expect(CCC_PHASE_BY_KEY.high_control.order).toBe(0);
    const r = computeCccRead(baseInput({ phaseKey: "high_control" }));
    expect(r.nextPhase?.key).toBe("moderate_control");
    const last = computeCccRead(baseInput({ phaseKey: "team_training" }));
    expect(last.nextPhase).toBeNull();
  });
});
