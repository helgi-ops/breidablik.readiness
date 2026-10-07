import { describe, it, expect } from "vitest";
import {
  checkSessionFit,
  aggregateSessionType,
  drillTypeToIntended,
  stimulusToIntended,
  dayTargetFromPlanned,
  type BuiltSessionSummary,
  type DayLoadTarget,
} from "../sessionFitCheck";
import { specForDay, DEFAULT_MD_MICROCYCLE, TACTICAL_PERIODIZATION_MORPHOCYCLE } from "../periodizationModel";
import { planSessionLoad } from "@/lib/micropulse/plannedSessionLoad";

const md4 = specForDay(DEFAULT_MD_MICROCYCLE, "MD-4")!; // mechanical
const md2Default = specForDay(DEFAULT_MD_MICROCYCLE, "MD-2")!; // locomotive
const md2Tp = specForDay(TACTICAL_PERIODIZATION_MORPHOCYCLE, "MD-2")!; // speed
const name = { en: "test", is: "test" };

describe("drillTypeToIntended / aggregateSessionType", () => {
  it("maps drill load characters into the model vocabulary", () => {
    expect(drillTypeToIntended("mechanical")).toBe("mechanical");
    expect(drillTypeToIntended("metabolic")).toBe("locomotive");
    expect(drillTypeToIntended("balanced")).toBe("mixed");
    expect(drillTypeToIntended("low")).toBeNull();
  });
  it("picks the most common type, ignoring nulls", () => {
    expect(aggregateSessionType([{ loadType: "locomotive" }, { loadType: "locomotive" }, { loadType: "mechanical" }, { loadType: null }])).toBe("locomotive");
    expect(aggregateSessionType([{ loadType: null }])).toBeNull();
  });
});

describe("stimulusToIntended (advisory speaks the same vocabulary as the stimulus strip)", () => {
  it("maps the drill-stimulus classes to the model vocabulary", () => {
    expect(stimulusToIntended("mechanical")).toBe("mechanical");
    expect(stimulusToIntended("locomotive")).toBe("locomotive");
    expect(stimulusToIntended("mixed")).toBe("mixed");
    expect(stimulusToIntended("technical")).toBeNull(); // no physical dominance
  });
  it("a MIXED session on a MECHANICAL day is only a watch, never a hard mismatch", () => {
    // Regression for the 'locomotive banner over a MIX 100% bar' confusion: when the
    // strip classifies the drills as mixed, the advisory must agree (mixed → watch).
    const res = checkSessionFit({
      session: { dominantType: "mixed", loadAu: null, matchPct: null, perKpi: {}, anyMetricsEstimated: false },
      daySpec: md4, // mechanical
      modelName: name,
      drills: [{ id: "d1", name: "SSG 10v10", loadType: "mixed", category: null, metricsEstimated: false }],
    });
    const typeW = res.warnings.find((w) => w.kind === "type_mismatch");
    expect(typeW?.level).toBe("watch");
  });
});

describe("type_mismatch", () => {
  it("flags a locomotive session on an MD-4 mechanical day as a mismatch", () => {
    const session: BuiltSessionSummary = { dominantType: "locomotive", loadAu: null, matchPct: null };
    const r = checkSessionFit({
      session,
      daySpec: md4,
      modelName: name,
      drills: [{ id: "d1", name: "11v11 large pitch", loadType: "locomotive" }],
    });
    const w = r.warnings.find((x) => x.kind === "type_mismatch");
    expect(w?.level).toBe("mismatch");
    expect(r.verdict).toBe("review");
    // names the drill pushing the wrong way
    expect(w?.why.some((f) => f.en.includes("11v11 large pitch"))).toBe(true);
    // has a counterfactual
    expect(w?.counterfactual.en.length).toBeGreaterThan(0);
  });

  it("the SAME speed session reads differently under the two models (MD-2)", () => {
    const session: BuiltSessionSummary = { dominantType: "speed", loadAu: null, matchPct: null };
    const underDefault = checkSessionFit({ session, daySpec: md2Default, modelName: name }); // locomotive day
    const underTp = checkSessionFit({ session, daySpec: md2Tp, modelName: name }); // speed day
    expect(underDefault.warnings.some((w) => w.kind === "type_mismatch")).toBe(true);
    expect(underTp.warnings.some((w) => w.kind === "type_mismatch")).toBe(false);
    expect(underTp.verdict).toBe("fits");
  });

  it("drops confidence to low when the session's metrics were estimated", () => {
    const session: BuiltSessionSummary = { dominantType: "locomotive", loadAu: null, matchPct: null, anyMetricsEstimated: true };
    const r = checkSessionFit({ session, daySpec: md4, modelName: name });
    expect(r.warnings.find((w) => w.kind === "type_mismatch")?.confidence).toBe("low");
  });
});

describe("load_overshoot", () => {
  const target: DayLoadTarget = {
    band: "moderate", matchPct: 50, loadAu: 420,
    byKpi: { hsr: 400, player_load: 500, accel_decel: 60 },
  };
  it("flags a session well above the day's load with KPI drivers + counterfactual", () => {
    const session: BuiltSessionSummary = {
      dominantType: "locomotive", loadAu: 630, matchPct: 72, // ~1.5× the AU target
      perKpi: { hsr: 700, player_load: 520, accel_decel: 62 }, // HSR is the big driver
    };
    const r = checkSessionFit({ session, daySpec: md2Default, dayTarget: target, modelName: name });
    const w = r.warnings.find((x) => x.kind === "load_overshoot");
    expect(w).toBeTruthy();
    expect(w?.level).toBe("mismatch"); // 1.5× > 1.35
    expect(w?.why.some((f) => f.en.toLowerCase().includes("high-speed running"))).toBe(true);
    expect(w?.counterfactual.en.length).toBeGreaterThan(0);
    expect(w?.confidence).toBe("high"); // KPI drivers present
  });
  it("does not flag a session inside the band", () => {
    const session: BuiltSessionSummary = { dominantType: "locomotive", loadAu: 430, matchPct: 51 };
    const r = checkSessionFit({ session, daySpec: md2Default, dayTarget: target, modelName: name });
    expect(r.warnings.some((w) => w.kind === "load_overshoot")).toBe(false);
  });
  it("flags a model intensity-cap breach even when AU is in band", () => {
    // MD-4 default cap is 75% of a match; AU target high enough that ratio stays in band.
    const bigTarget: DayLoadTarget = { band: "high", matchPct: 68, loadAu: 10000 };
    const session: BuiltSessionSummary = { dominantType: "mechanical", loadAu: 9000, matchPct: 90 };
    const r = checkSessionFit({ session, daySpec: md4, dayTarget: bigTarget, modelName: name });
    const w = r.warnings.find((x) => x.kind === "load_overshoot");
    expect(w).toBeTruthy();
    expect(w?.headline.en.toLowerCase()).toContain("cap");
  });
});

describe("tactical_mismatch (confidence-gated, opt-in)", () => {
  it("is omitted entirely when the model sets no tactical target", () => {
    const session: BuiltSessionSummary = { dominantType: "mechanical", loadAu: null, matchPct: null };
    const r = checkSessionFit({ session, daySpec: md4, modelName: name, drills: [{ id: "d1", loadType: "mechanical" }] });
    expect(r.warnings.some((w) => w.kind === "tactical_mismatch")).toBe(false);
  });
  it("warns at LOW confidence when no drill carries the TP day's principle", () => {
    const tpMd4 = specForDay(TACTICAL_PERIODIZATION_MORPHOCYCLE, "MD-4")!; // has a principleTag
    const session: BuiltSessionSummary = { dominantType: "mechanical", loadAu: null, matchPct: null };
    const r = checkSessionFit({
      session, daySpec: tpMd4, modelName: name,
      drills: [{ id: "d1", loadType: "mechanical", category: "passing", principleTag: null }],
    });
    const w = r.warnings.find((x) => x.kind === "tactical_mismatch");
    expect(w?.confidence).toBe("low");
    expect(w?.level).toBe("watch");
  });
  it("does not warn when a drill is tagged for the day's principle", () => {
    const tpMd4 = specForDay(TACTICAL_PERIODIZATION_MORPHOCYCLE, "MD-4")!;
    const session: BuiltSessionSummary = { dominantType: "mechanical", loadAu: null, matchPct: null };
    const r = checkSessionFit({
      session, daySpec: tpMd4, modelName: name,
      drills: [{ id: "d1", loadType: "mechanical", principleTag: "finishing in reduced spaces" }],
    });
    expect(r.warnings.some((w) => w.kind === "tactical_mismatch")).toBe(false);
  });
});

describe("null-safety & boundaries", () => {
  it("no dayTarget → no overshoot; no daySpec → no type/tactical", () => {
    const session: BuiltSessionSummary = { dominantType: "locomotive", loadAu: 999, matchPct: 99 };
    const noTarget = checkSessionFit({ session, daySpec: md4, modelName: name });
    expect(noTarget.warnings.some((w) => w.kind === "load_overshoot")).toBe(false);
    const noSpec = checkSessionFit({ session, daySpec: null, dayTarget: { band: "light", matchPct: 10, loadAu: 10 }, modelName: name });
    expect(noSpec.warnings.some((w) => w.kind === "type_mismatch")).toBe(false);
  });
  it("a clean session fits", () => {
    const session: BuiltSessionSummary = { dominantType: "mechanical", loadAu: 400, matchPct: 60 };
    const r = checkSessionFit({ session, daySpec: md4, dayTarget: { band: "high", matchPct: 68, loadAu: 595 }, modelName: name });
    expect(r.verdict).toBe("fits");
    expect(r.warnings.length).toBe(0);
  });
  it("is descriptive-only — the result carries a verdict of fits/review and no colour field", () => {
    const session: BuiltSessionSummary = { dominantType: "locomotive", loadAu: null, matchPct: null };
    const r = checkSessionFit({ session, daySpec: md4, modelName: name });
    expect(["fits", "review"]).toContain(r.verdict);
    expect(Object.keys(r)).not.toContain("color");
    expect(JSON.stringify(r).toLowerCase()).not.toMatch(/"(green|amber|red|colour|color)"\s*:/);
  });
});

describe("dayTargetFromPlanned bridge", () => {
  it("builds a DayLoadTarget from a real planSessionLoad result", () => {
    const planned = planSessionLoad({ mdDay: "MD-4", dayType: null, focus: "FORCE" });
    const t = dayTargetFromPlanned(planned, { hsr: 400 });
    expect(t).toBeTruthy();
    expect(t?.band).toBe(planned.band);
    expect(t?.loadAu).toBe(planned.sessionLoad);
    expect(t?.byKpi?.hsr).toBe(400);
  });
  it("returns null for a non-applicable day (match / off)", () => {
    const planned = planSessionLoad({ mdDay: "MD", dayType: "GAME", focus: null });
    expect(dayTargetFromPlanned(planned)).toBeNull();
  });
});
