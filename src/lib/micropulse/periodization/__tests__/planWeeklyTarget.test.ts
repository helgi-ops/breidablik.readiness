import { describe, it, expect } from "vitest";
import { planWeeklyTarget, OFFSEASON_MAINTENANCE_MULT } from "../planWeeklyTarget";
import { kpiTaperShare } from "../plannedVolume";
import type { MatchUnit, SeasonPhase, MesoBlock } from "../index";

const m = (typical: number): { typical: number; peak: number } => ({ typical, peak: typical });
// A match unit with distance 10km, PL 1000, HSR 600 (sprint 150 → band5 450), sprint 150, accel 40, decel 45.
const UNIT = {
  nNearFull: 10, nInWindow: 10, fellBack: false, confidence: "high", windowNote: { en: "", is: "" }, minutesTypical: 90,
  load: m(1000), distance: m(10000), hsr: m(600), sprint: m(150), accel: m(40), decel: m(45),
  accHiEff: m(0), decHiEff: m(0), stride: m(0), rhie: m(0), symmetry: m(0), metPower: m(0),
} as unknown as MatchUnit;

const phase = (key: string, start: string, end: string, weeks: number): SeasonPhase =>
  ({ key, label: { en: key, is: key }, start, end, weeks, matches: 0, rationale: { en: "", is: "" } }) as SeasonPhase;

// Season: pre-season 2 Feb–10 Apr (10w), competitive 10 Apr–24 Oct, off-season 25 Oct–30 Nov (next pre 30 Nov).
const PHASES: SeasonPhase[] = [
  phase("preseason", "2026-02-02", "2026-04-10", 10),
  phase("competitive", "2026-04-10", "2026-10-25", 28),
  phase("offseason", "2026-10-25", "2026-11-30", 5),
];

describe("planWeeklyTarget", () => {
  it("off-season → maintenance (~1.2× match, high-intensity tapered)", () => {
    const t = planWeeklyTarget({ phases: PHASES, matchUnits: [UNIT], today: "2026-10-28" })!;
    expect(t.phase).toBe("offseason");
    expect(t.byKpi.totalDistance).toBe(Math.round(10000 * OFFSEASON_MAINTENANCE_MULT)); // share 1.0
    expect(t.byKpi.velocityBand6).toBe(Math.round(150 * OFFSEASON_MAINTENANCE_MULT * kpiTaperShare("velocityBand6")));
    // per-match share: sprint tapers harder than acc/dec
    expect(t.byKpi.velocityBand6! / 150).toBeLessThan(t.byKpi.accelB23! / 40);
  });

  it("in-season (no blocks) → base fixture-aware weekly volume, each KPI tapered (sprint < distance ×match)", () => {
    const t = planWeeklyTarget({ phases: PHASES, matchUnits: [UNIT], today: "2026-06-01", matchesThisWeek: 1 })!;
    expect(t.phase).toBe("inseason");
    // distance ≈ 2.35× a match (volume), sprint a smaller multiple
    expect(t.byKpi.totalDistance! / 10000).toBeCloseTo(2.35, 1);
    expect(t.byKpi.velocityBand6! / 150).toBeLessThan(t.byKpi.totalDistance! / 10000);
    expect(t.label.en).toContain("1-match");
  });

  it("in-season applies the meso ramp — a loading block week scales the base volume up (+5%/wk)", () => {
    // 4-week block starting Mon 25 May, deload = last week (15 Jun). Today 1 Jun = block week 2 → +5%.
    const block = { index: 0, start: "2026-05-25", end: "2026-06-22", weeks: 4, deloadWeekStart: "2026-06-15" } as unknown as MesoBlock;
    const base = planWeeklyTarget({ phases: PHASES, matchUnits: [UNIT], today: "2026-06-01", matchesThisWeek: 1 })!;
    const ramped = planWeeklyTarget({ phases: PHASES, blocks: [block], matchUnits: [UNIT], today: "2026-06-01", matchesThisWeek: 1 })!;
    expect(ramped.weekIndex).toBe(2);
    expect(ramped.totalWeeks).toBe(4);
    expect(ramped.byKpi.totalDistance).toBe(Math.round(base.byKpi.totalDistance! * 1.05));
    expect(ramped.label.en).toContain("block wk 2/4");
  });

  it("in-season deload week drops the whole week to ~60%", () => {
    const block = { index: 0, start: "2026-05-25", end: "2026-06-22", weeks: 4, deloadWeekStart: "2026-06-15" } as unknown as MesoBlock;
    const base = planWeeklyTarget({ phases: PHASES, matchUnits: [UNIT], today: "2026-06-15", matchesThisWeek: 1 })!;
    const deload = planWeeklyTarget({ phases: PHASES, blocks: [block], matchUnits: [UNIT], today: "2026-06-15", matchesThisWeek: 1 })!;
    expect(deload.byKpi.totalDistance).toBe(Math.round(base.byKpi.totalDistance! * 0.6));
    expect(deload.label.en).toContain("deload");
  });

  it("upcoming pre-season → week 1 when the off-season has just ended (30 Nov), not the historical 2 Feb", () => {
    const t = planWeeklyTarget({ phases: PHASES, matchUnits: [UNIT], today: "2026-12-01" })!;
    expect(t.phase).toBe("preseason");
    expect(t.weekIndex).toBe(1);
    expect(t.totalWeeks).toBe(10);
    expect(t.multipleOfMatch).toBeCloseTo(1.3, 5);
    // week-1 re-entry: distance ≈ match × 1.3; sprint tapered below that
    expect(t.byKpi.totalDistance).toBe(Math.round(10000 * 1.3));
    expect(t.byKpi.velocityBand6! / 150).toBeLessThan(1.3);
  });

  it("historical pre-season week resolves by date", () => {
    const t = planWeeklyTarget({ phases: PHASES, matchUnits: [UNIT], today: "2026-02-16" })!; // 2 weeks in → week 3
    expect(t.phase).toBe("preseason");
    expect(t.weekIndex).toBe(3);
  });

  it("returns null with no match unit", () => {
    const nul = { typical: null, peak: null };
    const empty = { ...UNIT, load: nul, distance: nul, hsr: nul, sprint: nul, accel: nul, decel: nul } as unknown as MatchUnit;
    expect(planWeeklyTarget({ phases: PHASES, matchUnits: [empty], today: "2026-10-28" })).toBeNull();
  });
});
