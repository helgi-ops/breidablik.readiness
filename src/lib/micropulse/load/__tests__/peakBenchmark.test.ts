import { describe, it, expect } from "vitest";
import { computePeakBenchmark, JU_TABLE2, TOP_SPEED_ELITE, MAX_PLAUSIBLE_TOP_SPEED } from "../peakBenchmark";
import { juPositionGroup } from "@/lib/micropulse/positionStyle";

const base = { position: "RW", sport: "football", bestTopSpeedKmh: 34.4, hsrPer90: 1261, sprintPer90: 349, matchCount: 12 };

describe("juPositionGroup", () => {
  it("splits wingers (WOP) from centre-forwards (COP) — unlike GROUP_OF", () => {
    expect(juPositionGroup("RW")).toBe("WOP");
    expect(juPositionGroup("LW")).toBe("WOP");
    expect(juPositionGroup("CF")).toBe("COP");
    expect(juPositionGroup("ST")).toBe("COP");
  });
  it("maps defenders and mids", () => {
    expect(juPositionGroup("CB")).toBe("CDP");
    expect(juPositionGroup("RB")).toBe("WDP");
    expect(juPositionGroup("LB")).toBe("WDP");
    expect(juPositionGroup("CM")).toBe("CMP");
    expect(juPositionGroup("DM")).toBe("CMP");
    expect(juPositionGroup("AM")).toBe("CMP");
  });
  it("returns null for GK, unknown, and basketball", () => {
    expect(juPositionGroup("GK")).toBeNull();
    expect(juPositionGroup("")).toBeNull();
    expect(juPositionGroup("XYZ")).toBeNull();
    expect(juPositionGroup("RW", "basketball")).toBeNull();
  });
});

describe("computePeakBenchmark — top-speed track (comparable now)", () => {
  it("grades a winger's top speed as elite and scopes the verdict to the position", () => {
    const r = computePeakBenchmark(base);
    expect(r.juGroup).toBe("WOP");
    expect(r.juGroupLabel.en).toBe("winger");
    const top = r.rows.find((x) => x.key === "top_speed")!;
    expect(top.band).toBe("elite");
    expect(top.comparable).toBe(true);
    expect(r.verdict.en).toContain("winger");
    expect(r.verdict.en.toLowerCase()).toContain("elite");
  });

  it("bands high / average / below by threshold", () => {
    expect(computePeakBenchmark({ ...base, bestTopSpeedKmh: 33 }).rows[0].band).toBe("high");
    expect(computePeakBenchmark({ ...base, bestTopSpeedKmh: 31 }).rows[0].band).toBe("average");
    expect(computePeakBenchmark({ ...base, bestTopSpeedKmh: 28 }).rows[0].band).toBe("below");
  });

  it("drops an implausible top-speed spike above the 38 km/h gate (never reads elite)", () => {
    const r = computePeakBenchmark({ ...base, bestTopSpeedKmh: MAX_PLAUSIBLE_TOP_SPEED + 5 });
    expect(r.rows[0].playerValue).toBeNull();
    expect(r.rows[0].comparable).toBe(false);
    expect(r.confidence).toBe("low");
  });

  it("shows HSR/90 and sprint/90 as CONTEXT, never graded against Table 2", () => {
    const r = computePeakBenchmark(base);
    const hsr = r.rows.find((x) => x.key === "hsr90")!;
    const sprint = r.rows.find((x) => x.key === "sprint90")!;
    expect(hsr.band).toBe("context");
    expect(hsr.comparable).toBe(false);
    expect(sprint.band).toBe("context");
    expect(sprint.comparable).toBe(false);
  });
});

describe("computePeakBenchmark — peak-HIR track (hard gate)", () => {
  it("hard-gates the Table 2 track when no per-window HIR is supplied (the norm today)", () => {
    const r = computePeakBenchmark(base);
    expect(r.peakHir.comparable).toBe(false);
    expect(r.peakHir.rows).toHaveLength(0);
    expect(r.peakHir.gapNote.en).toContain("TOTAL distance");
    // The group's reference is still shown so the coach sees the target.
    expect(r.peakHir.ref.w1).toBe(`${JU_TABLE2.WOP.w1.mean} +/- ${JU_TABLE2.WOP.w1.sd}`);
  });

  it("does NOT gate on total-distance m/min masquerading as HIR — caller must pass real HIR", () => {
    // passing null (as the route does for total-distance data) keeps the gate closed
    const r = computePeakBenchmark({ ...base, peakHirPerMin: null });
    expect(r.peakHir.comparable).toBe(false);
  });

  it("grades the Table 2 track when real peak-HIR-per-window data is provided", () => {
    const r = computePeakBenchmark({ ...base, peakHirPerMin: { w1: 80, w3: 30, w5: 20 } });
    expect(r.peakHir.comparable).toBe(true);
    expect(r.peakHir.rows).toHaveLength(3);
    const w1 = r.peakHir.rows.find((x) => x.key === "hir1")!;
    expect(w1.playerValue).toBe(80);
    expect(w1.band).toBe("elite"); // 80 >= WOP mean 76
    const w3 = r.peakHir.rows.find((x) => x.key === "hir3")!;
    expect(w3.band).toBe("below"); // 30 < WOP 3-min mean 36 * 0.85
  });

  it("carries HSR-threshold provenance and flags a non-19.8 threshold", () => {
    const clean = computePeakBenchmark({ ...base, peakHirPerMin: { w1: 80, w3: 30, w5: 20 }, hsrThresholdKmh: 19.8 });
    expect(clean.peakHir.thresholdKmh).toBe(19.8);
    expect(clean.peakHir.thresholdNote?.en).toMatch(/matches Ju/i);
    const off = computePeakBenchmark({ ...base, peakHirPerMin: { w1: 80, w3: 30, w5: 20 }, hsrThresholdKmh: 21 });
    expect(off.peakHir.thresholdNote?.en).toContain("21");
    const missing = computePeakBenchmark({ ...base, peakHirPerMin: { w1: 80, w3: 30, w5: 20 } });
    expect(missing.peakHir.thresholdNote?.en).toMatch(/not recorded/i);
    // no note when the track is gated
    expect(computePeakBenchmark(base).peakHir.thresholdNote).toBeNull();
  });
});

describe("computePeakBenchmark — peak-period SHAPE (total distance, context only)", () => {
  it("computes the fall-off and reads 'sustains' when the peak-minute rate holds", () => {
    const r = computePeakBenchmark({ ...base, peakDistanceShape: { w1: 335, w3: 261, w5: 243 } });
    expect(r.shape.available).toBe(true);
    expect(r.shape.retain5).toBe(73); // 243/335
    expect(r.shape.read).toBe("sustains");
    // it appears as a fact, explicitly labelled total distance / not HIR
    expect(r.facts.some((f) => /total distance/i.test(f.en) && /not HIR/i.test(f.en))).toBe(true);
  });

  it("reads 'steep' on a big drop and 'moderate' in between", () => {
    expect(computePeakBenchmark({ ...base, peakDistanceShape: { w1: 300, w3: 150, w5: 120 } }).shape.read).toBe("steep"); // 40%
    expect(computePeakBenchmark({ ...base, peakDistanceShape: { w1: 300, w3: 180, w5: 150 } }).shape.read).toBe("moderate"); // 50%
  });

  it("is unavailable (never graded) when no peak-distance windows are supplied", () => {
    const r = computePeakBenchmark(base);
    expect(r.shape.available).toBe(false);
    expect(r.shape.read).toBe("na");
    // the shape note never claims a Table 2 comparison
    expect(r.shape.note.en).toMatch(/not.*comparable to Table 2/i);
  });
});

describe("computePeakBenchmark — position + confidence edges", () => {
  it("GK / unknown position gets no group but still reads top speed against the general range", () => {
    const r = computePeakBenchmark({ ...base, position: "GK" });
    expect(r.juGroup).toBeNull();
    expect(r.verdict.en).toContain("No position benchmark");
    expect(r.rows[0].band).toBe("elite");
    // falls back to the all-teams reference in the peak-HIR track
    expect(r.peakHir.ref.w1).toContain("67");
  });

  it("confidence scales with match count and needs a top-speed reading", () => {
    expect(computePeakBenchmark({ ...base, matchCount: 12 }).confidence).toBe("high");
    expect(computePeakBenchmark({ ...base, matchCount: 2 }).confidence).toBe("medium");
    expect(computePeakBenchmark({ ...base, bestTopSpeedKmh: null }).confidence).toBe("low");
  });

  it("honest empty read when nothing is available", () => {
    const r = computePeakBenchmark({ position: null, sport: "football", bestTopSpeedKmh: null, hsrPer90: null, sprintPer90: null, matchCount: 0 });
    expect(r.rows[0].playerValue).toBeNull();
    expect(r.verdict.en).toContain("No top-speed reading");
    expect(r.peakHir.comparable).toBe(false);
    expect(r.confidence).toBe("low");
  });
});
