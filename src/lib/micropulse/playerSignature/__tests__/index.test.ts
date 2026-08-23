import { describe, it, expect } from "vitest";
import { computePlayerSignature, type SignatureInput, type SignaturePlayer } from "../index";
import type { QualityId } from "@/lib/micropulse/playerAnalysis/athleteProfile";

const p = (playerId: string, name: string, position: string, qualities: Partial<Record<QualityId, number>>): SignaturePlayer => ({ playerId, name, position, qualities });

const input = (over: Partial<SignatureInput["target"]>, pool: SignaturePlayer[] = []): SignatureInput => ({
  target: { playerId: "t", name: "Ágúst Orri", position: "RW", qualities: {}, driverPrimary: "speed", outputRead: "productive", sport: "football", ...over },
  pool,
});

describe("computePlayerSignature — archetype", () => {
  it("speed/anaerobic/peak dominant → vertical threat, with the output qualifier in the verdict", () => {
    const r = computePlayerSignature(input({ qualities: { speed: 95, anaerobic_reserve: 90, peak_demands: 88, acceleration: 85, change_of_direction: 40, aerobic_endurance: 45, robustness: 50 }, outputRead: "productive" }));
    expect(r.archetype).toBe("vertical");
    expect(r.verdict.en.toLowerCase()).toContain("vertical");
    expect(r.verdict.en.toLowerCase()).toContain("end product");
    expect(r.axes[0].key).toBe("vertical");
  });

  it("endurance/work dominant → high-volume engine", () => {
    const r = computePlayerSignature(input({ position: "CM", qualities: { aerobic_endurance: 92, work_capacity: 88, speed: 40, anaerobic_reserve: 45, change_of_direction: 50, robustness: 55 } }));
    expect(r.archetype).toBe("engine");
  });

  it("no clearly dominant axis → balanced", () => {
    const r = computePlayerSignature(input({ qualities: { speed: 55, anaerobic_reserve: 54, change_of_direction: 56, mechanical_power: 53, aerobic_endurance: 55, robustness: 54 } }));
    expect(r.archetype).toBe("balanced");
    expect(r.verdict.en.toLowerCase()).toContain("balanced");
  });
});

describe("computePlayerSignature — similarity / neighbours", () => {
  const pool = [
    p("a", "Aron Bjarnason", "LW", { speed: 90, anaerobic_reserve: 88, peak_demands: 85, change_of_direction: 42, aerobic_endurance: 44, robustness: 52 }), // very similar
    p("b", "Birkir Jóns", "RW", { speed: 30, anaerobic_reserve: 35, peak_demands: 30, change_of_direction: 80, aerobic_endurance: 85, robustness: 60 }), // very different
    p("c", "Cewe Þór", "LW", { speed: 88, anaerobic_reserve: 86, peak_demands: 80, change_of_direction: 45, aerobic_endurance: 48, robustness: 55 }), // similar
    p("d", "Dagur X", "CB", { speed: 20, anaerobic_reserve: 20, peak_demands: 25, robustness: 95, aerobic_endurance: 60 }), // other position
  ];
  const target = { qualities: { speed: 95, anaerobic_reserve: 90, peak_demands: 88, acceleration: 85, change_of_direction: 40, aerobic_endurance: 45, robustness: 50 } };

  it("ranks the most-similar same-position players first, excludes the target and off-position", () => {
    const r = computePlayerSignature(input(target, pool));
    expect(r.neighbourPool).toBe("position"); // 3 wide peers (a,b,c)
    expect(r.neighbours[0].name).toContain("Aron"); // closest
    expect(r.neighbours.map((n) => n.playerId)).not.toContain("t");
    expect(r.neighbours.map((n) => n.playerId)).not.toContain("d"); // CB excluded from position pool
    expect(r.neighbours[0].similarity).toBeGreaterThan(r.neighbours[r.neighbours.length - 1].similarity - 1);
  });

  it("falls back to the whole squad when there are too few same-position peers", () => {
    const r = computePlayerSignature(input(target, [p("d", "Dagur X", "CB", { speed: 90, anaerobic_reserve: 88, peak_demands: 85, robustness: 50, aerobic_endurance: 45 })]));
    expect(r.neighbourPool).toBe("squad");
    expect(r.neighbours[0].playerId).toBe("d");
  });
});

describe("computePlayerSignature — goalkeepers out of scope", () => {
  it("a GK is not applicable — no outfield archetype, no cross-position neighbours", () => {
    const r = computePlayerSignature(input({ position: "GK", qualities: { speed: 20, robustness: 80, reactive_power: 70 } }, [p("x", "Out X", "CM", { speed: 20, robustness: 80, reactive_power: 70 })]));
    expect(r.applicable).toBe(false);
    expect(r.neighbours).toHaveLength(0);
    expect(r.verdict.en.toLowerCase()).toContain("goalkeeper");
  });
});

describe("computePlayerSignature — confidence / coverage", () => {
  it("thin coverage → low confidence, honest fact", () => {
    const r = computePlayerSignature(input({ qualities: { speed: 90 } }, []));
    expect(r.confidence).toBe("low");
    expect(r.coverage).toBe(1);
  });
});
