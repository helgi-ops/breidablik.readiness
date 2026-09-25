import { describe, it, expect } from "vitest";
import { preseasonStartRamp, defaultPeakMultiple } from "../preseasonStart";

const MATCH = 1000; // arbitrary match-unit load
const KPI = { totalDistance: 10000, velocityBand6: 300, accelB23: 40, decelB23: 45, totalPlayerLoad: 500 };

describe("preseasonStartRamp", () => {
  it("week 1 is a controlled re-entry well below the peak build week", () => {
    const rows = preseasonStartRamp({ matchTypicalLoad: MATCH, matchKpiAvg: KPI, sessionsPerWeek: 4, preseasonWeeks: 6, anchor: "match_this_season" });
    expect(rows).toHaveLength(6);
    const w1 = rows[0];
    const wLast = rows[rows.length - 1];
    expect(w1.multipleOfMatch!).toBeCloseTo(1.3, 5);       // default re-entry
    expect(w1.multipleOfMatch!).toBeLessThan(wLast.multipleOfMatch!);
    expect(w1.weeklyLoadTarget!).toBeLessThan(wLast.weeklyLoadTarget!);
    // Week 1 weekly load ≈ 1.3 match, per-session ≈ that / 4
    expect(w1.weeklyLoadTarget).toBe(1300);
    expect(w1.perSessionLoad).toBe(325);
  });

  it("ramps monotonically to the peak (build destination) multiple", () => {
    const peak = defaultPeakMultiple(4);
    const rows = preseasonStartRamp({ matchTypicalLoad: MATCH, sessionsPerWeek: 4, preseasonWeeks: 5, anchor: "match_this_season" });
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].multipleOfMatch!).toBeGreaterThanOrEqual(rows[i - 1].multipleOfMatch!);
    }
    expect(rows[rows.length - 1].multipleOfMatch!).toBeCloseTo(peak, 5);
  });

  it("scales every KPI by the week's multiple", () => {
    const rows = preseasonStartRamp({ matchTypicalLoad: MATCH, matchKpiAvg: KPI, sessionsPerWeek: 4, preseasonWeeks: 4, anchor: "match_this_season" });
    const w1 = rows[0];
    expect(w1.byKpi.totalDistance).toBe(Math.round(10000 * 1.3));
    expect(w1.byKpi.velocityBand6).toBe(Math.round(300 * 1.3));
    expect(w1.byKpi.accelB23).toBe(Math.round(40 * 1.3));
    // last week scales the same KPIs by the larger multiple
    const wl = rows[rows.length - 1];
    expect(wl.byKpi.totalDistance!).toBeGreaterThan(w1.byKpi.totalDistance!);
  });

  it("carries an sRPE/AU weekly target when a match sRPE anchor is given", () => {
    const rows = preseasonStartRamp({ matchTypicalLoad: MATCH, matchSrpeAu: 600, sessionsPerWeek: 4, preseasonWeeks: 4, anchor: "match_this_season" });
    expect(rows[0].sRpeAuTarget).toBe(Math.round(600 * 1.3));
    expect(rows[rows.length - 1].sRpeAuTarget!).toBeGreaterThan(rows[0].sRpeAuTarget!);
  });

  it("sRPE/AU target is null when no match sRPE anchor is supplied", () => {
    const rows = preseasonStartRamp({ matchTypicalLoad: MATCH, sessionsPerWeek: 4, preseasonWeeks: 3, anchor: "match_this_season" });
    expect(rows[0].sRpeAuTarget).toBeNull();
  });

  it("never fabricates a GPS number when the match unit is null (srpe-only anchor still gives AU)", () => {
    const rows = preseasonStartRamp({ matchTypicalLoad: null, matchSrpeAu: 550, sessionsPerWeek: 4, preseasonWeeks: 4, anchor: "srpe_only" });
    expect(rows[0].weeklyLoadTarget).toBeNull();
    expect(rows[0].perSessionLoad).toBeNull();
    expect(rows[0].byKpi).toEqual({});
    expect(rows[0].sRpeAuTarget).toBe(Math.round(550 * 1.3)); // AU still present
    expect(rows[0].multipleOfMatch).toBeCloseTo(1.3, 5);      // ramp shape still defined
  });

  it("maps confidence + anchor per the fallback chain", () => {
    expect(preseasonStartRamp({ matchTypicalLoad: MATCH, preseasonWeeks: 2, anchor: "match_this_season" })[0].confidence).toBe("high");
    expect(preseasonStartRamp({ matchTypicalLoad: MATCH, preseasonWeeks: 2, anchor: "match_last_season" })[0].confidence).toBe("moderate");
    expect(preseasonStartRamp({ matchTypicalLoad: MATCH, preseasonWeeks: 2, anchor: "normative" })[0].confidence).toBe("low");
    expect(preseasonStartRamp({ matchTypicalLoad: MATCH, preseasonWeeks: 2, anchor: "srpe_only" })[0].confidence).toBe("low");
    expect(preseasonStartRamp({ matchTypicalLoad: MATCH, preseasonWeeks: 2, anchor: "match_last_season" })[0].anchor).toBe("match_last_season");
  });

  it("individual vs team differ purely by the match unit (same shape, scaled)", () => {
    const team = preseasonStartRamp({ matchTypicalLoad: 1000, sessionsPerWeek: 4, preseasonWeeks: 4, anchor: "match_this_season" });
    const player = preseasonStartRamp({ matchTypicalLoad: 1200, sessionsPerWeek: 4, preseasonWeeks: 4, anchor: "match_this_season" });
    expect(player[0].multipleOfMatch).toBe(team[0].multipleOfMatch);           // same ramp
    expect(player[0].weeklyLoadTarget!).toBeGreaterThan(team[0].weeklyLoadTarget!); // bigger match unit → bigger target
  });

  it("respects a custom week-1 multiple and peak, staying monotonic", () => {
    const rows = preseasonStartRamp({ matchTypicalLoad: MATCH, sessionsPerWeek: 4, preseasonWeeks: 4, week1MatchMultiple: 1.0, peakMatchMultiple: 3.0, anchor: "match_this_season" });
    expect(rows[0].multipleOfMatch).toBeCloseTo(1.0, 5);
    expect(rows[rows.length - 1].multipleOfMatch).toBeCloseTo(3.0, 5);
    for (let i = 1; i < rows.length; i++) expect(rows[i].multipleOfMatch!).toBeGreaterThanOrEqual(rows[i - 1].multipleOfMatch!);
  });

  it("a single pre-season week stays at the re-entry multiple", () => {
    const rows = preseasonStartRamp({ matchTypicalLoad: MATCH, sessionsPerWeek: 4, preseasonWeeks: 1, anchor: "match_this_season" });
    expect(rows).toHaveLength(1);
    expect(rows[0].multipleOfMatch).toBeCloseTo(1.3, 5);
  });
});

describe("purity boundary", () => {
  it("does not import readiness / decision / load-target engines", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync(new URL("../preseasonStart.ts", import.meta.url), "utf8");
    const imports = src.split("\n").filter((l) => /^\s*import\b/.test(l)).join("\n");
    for (const bad of ["readiness", "resolveFinalState", "stage4", "athlete_decision", "loadTarget"]) {
      expect(imports.includes(bad)).toBe(false);
    }
  });
});
