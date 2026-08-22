import { describe, it, expect } from "vitest";
import { computeRoleDemandFit, type RoleDemandFitInput } from "@/lib/micropulse/roleDemandFit";
import type { AthleteProfile, QualityId, QualityRead } from "@/lib/micropulse/playerAnalysis/athleteProfile";

/** Minimal AthleteProfile from a {qualityId: positionPercentile} map (mirrors gamePlanFit's makeProfile). */
function makeProfile(position: string, pctls: Partial<Record<QualityId, number>>, ratio = 0.7): AthleteProfile {
  const qualities: QualityRead[] = (Object.keys(pctls) as QualityId[]).map((id) => ({
    id, value: 1, unit: "", source: "GPS", date: "2026-08-01", sampleSize: 10,
    positionPercentile: pctls[id] ?? null, squadPercentile: pctls[id] ?? null,
    benchmark: "position", poolSize: 8, verdict: "neutral", confidence: "moderate", trend: null,
  }));
  return {
    playerId: "p1", position, positionGroup: null, qualities, strengths: [], weaknesses: [],
    coverage: { sources: ["GPS", "VALD"], qualitiesWithData: qualities.length, totalQualities: 13, ratio },
  };
}

function input(over: Partial<RoleDemandFitInput> = {}): RoleDemandFitInput {
  return {
    playerId: "p1", name: "Ágúst", position: "RW", sport: "football",
    profile: makeProfile("RW", {}), driver: { primary: "speed", secondary: "agility" },
    output: { per90: 0.5, baselinePer90: 0.4, matches: 12 },
    ...over,
  };
}

describe("computeRoleDemandFit — Ágúst RW (the prototype)", () => {
  // Elite athletic engine with a genuine (but not bottom-of-squad) durability gap — the
  // aerobic/robustness base sits low enough to be the watch-item, high enough that the
  // demand-weighted engine still reads elite.
  const augProfile = makeProfile("RW", {
    speed: 100, anaerobic_reserve: 100, mechanical_power: 100, peak_demands: 95,
    aerobic_endurance: 38, robustness: 40,
  });
  const r = computeRoleDemandFit(input({ profile: augProfile }));

  it("scopes to the Ju winger group (WOP), not the AM fold", () => {
    expect(r.juGroup).toBe("WOP");
    expect(r.roleLabel.en).toBe("winger");
    expect(r.scored).toBe(true);
  });

  it("reads an elite engine, driver fits, output productive", () => {
    expect(r.engine.band).toBe("elite");
    expect(r.engine.score).toBeGreaterThanOrEqual(80);
    expect(r.driver.fit).toBe("fits");
    expect(r.output.read).toBe("productive");
  });

  it("surfaces aerobic endurance + robustness as the watch-items (the fusion signal)", () => {
    const q = r.watch.map((w) => w.quality).sort();
    expect(q).toEqual(["aerobic_endurance", "robustness"]);
  });

  it("composes the plain verdict without jargon", () => {
    expect(r.verdict.en).toContain("Elite winger engine");
    expect(r.verdict.en).toContain("matched to his role");
    expect(r.verdict.en).toContain("end product");
    expect(r.verdict.en.toLowerCase()).toContain("watch-item");
    expect(r.verdict.en).not.toContain("percentile");
    expect(r.verdict.en).not.toContain("OBV");
    expect(r.counterfactual?.en).toContain("complete");
    expect(r.confidence).toBe("high");
  });
});

describe("computeRoleDemandFit — discrimination (must not rate everyone elite)", () => {
  it("a low-speed player mislabelled winger reads Below / atypical", () => {
    const weak = makeProfile("RW", {
      speed: 20, anaerobic_reserve: 25, mechanical_power: 20, peak_demands: 22,
      aerobic_endurance: 30, robustness: 28,
    });
    const r = computeRoleDemandFit(input({ profile: weak, driver: { primary: "volume", secondary: null }, output: { per90: 0.2, baselinePer90: 0.4, matches: 10 } }));
    expect(r.engine.band).toBe("below");
    expect(r.driver.fit).toBe("atypical"); // "volume" is not what a winger expects
    expect(r.output.read).toBe("under");
    expect(r.verdict.en).toContain("Below-par engine");
  });

  it("a solid (not elite) engine bands in the middle", () => {
    const mid = makeProfile("RW", { speed: 65, anaerobic_reserve: 60, mechanical_power: 60, peak_demands: 62, aerobic_endurance: 55, robustness: 58 });
    expect(computeRoleDemandFit(input({ profile: mid })).engine.band).toBe("solid");
  });
});

describe("computeRoleDemandFit — coverage & confidence", () => {
  it("missing output → output unknown and confidence drops from high", () => {
    const prof = makeProfile("RW", { speed: 100, anaerobic_reserve: 100, mechanical_power: 90, peak_demands: 90, aerobic_endurance: 70, robustness: 70 });
    const r = computeRoleDemandFit(input({ profile: prof, output: null }));
    expect(r.output.read).toBe("unknown");
    expect(r.coverage.output).toBe(false);
    expect(r.confidence).not.toBe("high");
  });

  it("missing engine (no profile) → engine unknown, low confidence, still scored", () => {
    const r = computeRoleDemandFit(input({ profile: null }));
    expect(r.engine.band).toBe("unknown");
    expect(r.confidence).toBe("low");
    expect(r.watch).toHaveLength(0);
  });

  it("thin engine coverage caps confidence low", () => {
    const thin = makeProfile("RW", { speed: 90 }, 0.15); // only 1 demanded quality has data
    const r = computeRoleDemandFit(input({ profile: thin }));
    expect(r.confidence).toBe("low");
  });
});

describe("computeRoleDemandFit — out of scope", () => {
  it("a goalkeeper is honestly out of scope (no outfield demand model)", () => {
    const r = computeRoleDemandFit(input({ position: "GK", profile: makeProfile("GK", { speed: 50 }) }));
    expect(r.juGroup).toBeNull();
    expect(r.scored).toBe(false);
    expect(r.verdict.en).toContain("no outfield role-demand benchmark");
  });

  it("carries no readiness field — it is a development read, never the verdict colour", () => {
    const r = computeRoleDemandFit(input()) as Record<string, unknown>;
    expect(r.readinessColor).toBeUndefined();
    expect(r.readinessTier).toBeUndefined();
    // no readiness-colour token anywhere in the payload
    expect(JSON.stringify(r)).not.toMatch(/final_color|readinessColor|"(GREEN|YELLOW|RED)"/);
  });
});
