import { describe, it, expect } from "vitest";
import { preseasonStartRamp, defaultPeakMultiple } from "../preseasonStart";
import { kpiTaperShare } from "../plannedVolume";

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

  it("scales each KPI by the week's multiple × its OWN taper share (not uniformly)", () => {
    const rows = preseasonStartRamp({ matchTypicalLoad: MATCH, matchKpiAvg: KPI, sessionsPerWeek: 4, preseasonWeeks: 4, anchor: "match_this_season" });
    const w1 = rows[0];
    // Distance uses the pre-season re-entry FLOOR (aerobic volume built high & early): week 1 starts at
    // 0.80 × peak, ABOVE the generic ×1.3 re-entry that the mechanical KPIs keep.
    const peak = defaultPeakMultiple(4);
    expect(w1.byKpi.totalDistance).toBe(Math.round(10000 * (Math.round(0.80 * peak * 100) / 100)));
    expect(w1.byKpi.totalDistance!).toBeGreaterThan(Math.round(10000 * 1.3)); // floor raised it above re-entry
    // Mechanical KPIs keep the generic ×1.3 re-entry (no floor) × their own taper share.
    expect(w1.byKpi.velocityBand6).toBe(Math.round(300 * 1.3 * kpiTaperShare("velocityBand6")));
    expect(w1.byKpi.accelB23).toBe(Math.round(40 * 1.3 * kpiTaperShare("accelB23")));
    // Per-KPI ordering (T:M-calibrated): sprint < HSR < distance ≤ accel. Accel/decel COUNTS accumulate
    // AT LEAST as much as distance over a week (training is accel-dense), so their share is ≥ 1.
    expect(kpiTaperShare("velocityBand6")).toBeLessThan(kpiTaperShare("velocityBand5")); // sprint < HSR
    expect(kpiTaperShare("velocityBand5")).toBeLessThan(kpiTaperShare("totalDistance")); // HSR < distance
    expect(kpiTaperShare("totalDistance")).toBeCloseTo(1, 5);
    expect(kpiTaperShare("accelB23")).toBeGreaterThan(kpiTaperShare("totalDistance")); // accel ≥ distance (fixed inversion)
    expect(kpiTaperShare("accelB23")).toBeGreaterThan(kpiTaperShare("decelB23"));       // accel ≥ decel
    // last week scales the same KPIs by the larger multiple (ramp still rises for every KPI)
    const wl = rows[rows.length - 1];
    expect(wl.byKpi.totalDistance!).toBeGreaterThan(w1.byKpi.totalDistance!);
    expect(wl.byKpi.velocityBand6!).toBeGreaterThan(w1.byKpi.velocityBand6!);
  });

  it("progresses biomechanical KPIs conservatively (convex) vs physiological/volume (linear) in mid-ramp", () => {
    // Big KPI values so r0 rounding is negligible for the progress ratios. (Vanrenterghem 2017 two pathways.)
    const BIG = { totalDistance: 60000, velocityBand6: 2400, velocityBand5: 3000, accelB23: 1800, decelB23: 1800 };
    const rows = preseasonStartRamp({ matchTypicalLoad: MATCH, matchKpiAvg: BIG, sessionsPerWeek: 4, preseasonWeeks: 5, anchor: "match_this_season" });
    const w1 = rows[0], mid = rows[2], wl = rows[4]; // frac = 0, 0.5, 1
    // Normalised progress from week-1 to peak at the midpoint. Cancels the match value + taper share,
    // leaving frac^γ: linear pathways sit at ~0.5, the biomechanical pathway sits lower (convex).
    const prog = (k: keyof typeof BIG) => (mid.byKpi[k]! - w1.byKpi[k]!) / (wl.byKpi[k]! - w1.byKpi[k]!);
    expect(prog("totalDistance")).toBeCloseTo(0.5, 1);            // volume — linear
    expect(prog("accelB23")).toBeCloseTo(0.5, 1);                 // physiological (metabolic) — linear
    expect(prog("velocityBand6")).toBeCloseTo(Math.pow(0.5, 1.7), 1); // biomechanical — convex
    // The fix the research demands: deceleration (highest tissue load) ramps MORE conservatively than
    // acceleration (metabolic). prog() cancels the taper share, so this isolates the pathway curve.
    expect(prog("decelB23")).toBeLessThan(prog("accelB23"));
    expect(prog("velocityBand6")).toBeLessThan(prog("accelB23")); // sprint too
    expect(prog("velocityBand5")).toBeLessThan(prog("accelB23")); // HSR too
    // Each KPI reaches its OWN destination by the final build week at the same ramp fraction (1); the
    // pathway curve only changes the PATH. decel stays below accel throughout (convex curve + lower share).
    expect(mid.byKpi.decelB23!).toBeLessThan(mid.byKpi.accelB23!);
    expect(wl.byKpi.decelB23!).toBeLessThan(wl.byKpi.accelB23!); // accel share (1.05) > decel share (1.0)
  });

  it("re-entry floor: distance (and HSR) start HIGH early; sprint/mechanical keep the low re-entry", () => {
    const K = { totalDistance: 10000, velocityBand5: 800, velocityBand6: 300, accelB23: 40 };
    const rows = preseasonStartRamp({ matchTypicalLoad: MATCH, matchKpiAvg: K, sessionsPerWeek: 4, preseasonWeeks: 6, week1MatchMultiple: 1.3, anchor: "match_this_season" });
    const peak = defaultPeakMultiple(4);
    const w1 = rows[0];
    // Distance week-1 ×match = 0.80 × peak (well above the 1.3 generic re-entry).
    const distMult = w1.byKpi.totalDistance! / 10000;
    expect(distMult).toBeCloseTo(Math.round(0.80 * peak * 100) / 100, 2);
    expect(distMult).toBeGreaterThan(1.3);
    // HSR week-1 is elevated (floor 0.65 × peak × its taper share) — above its own generic-re-entry level…
    const hsrMult = w1.byKpi.velocityBand5! / 800;
    expect(hsrMult).toBeGreaterThan(1.3 * kpiTaperShare("velocityBand5")); // raised vs the 1.3 re-entry
    // …but still below distance (HSR is injury-sensitive, floor 0.65 < 0.80).
    expect(hsrMult).toBeLessThan(distMult);
    // Sprint keeps the conservative generic re-entry (no floor).
    expect(w1.byKpi.velocityBand6).toBe(Math.round(300 * 1.3 * kpiTaperShare("velocityBand6")));
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
