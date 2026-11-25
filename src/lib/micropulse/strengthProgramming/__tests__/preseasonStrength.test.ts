import { describe, it, expect } from "vitest";
import { preseasonStrengthWeeks, schemeHead, WEEK_RULE_CITE } from "../preseasonStrength";
import { strengthForBlockGoal } from "../seasonPhaseStrength";
import { MATCH_WEEK_HEAVY_REPS, NO_MATCH_WEEK_HEAVY_TOTAL, noMatchWeekRule } from "../weekRule";
import { DEFAULT_STRUCTURE_BY_MD, effectiveNoMatchWeek } from "../structures";
import { findRefByShort } from "../../references/ruleRefs";

const day = (date: string, type: string, md = "") => ({ date, type, md });
// A game week (Sat game): MD-5 … MD+1.
const GAME_WEEK = {
  weekStart: "2027-02-01",
  days: [day("2027-02-01", "mechanical", "MD-5"), day("2027-02-02", "mechanical", "MD-4"), day("2027-02-03", "locomotive", "MD-3"), day("2027-02-04", "rest", "MD-2"),
    day("2027-02-05", "activation", "MD-1"), day("2027-02-06", "match", "MD"), day("2027-02-07", "topup", "MD+1")],
};
// A week with no game (no MD labels).
const FREE_WEEK = {
  weekStart: "2027-02-08",
  days: ["08", "09", "10", "11", "12", "13", "14"].map((d, i) => day(`2027-02-${d}`, i === 3 || i >= 5 ? "rest" : "mixed")),
};
const BLOCKS = [
  { start: "2027-01-25", end: "2027-02-08", goalKey: "transmute" as const, goalByCoach: true },
  { start: "2027-02-08", end: "2027-03-08", goalKey: "accum" as const, goalByCoach: false },
];

describe("preseasonStrengthWeeks — what the strength delivery sends each pre-season week", () => {
  const [g, f] = preseasonStrengthWeeks({ weeks: [GAME_WEEK, FREE_WEEK], blocks: BLOCKS });

  it("the block's goal → the same scheme as strengthForBlockGoal(goal, preseason)", () => {
    expect(g.goalKey).toBe("transmute");
    expect(g.goalByCoach).toBe(true);
    expect(g.scheme).toEqual(strengthForBlockGoal("transmute", "preseason"));
    expect(f.scheme).toEqual(strengthForBlockGoal("accum", "preseason"));
  });

  it("a game week: heavy reps on the MD days from MATCH_WEEK_HEAVY_REPS.preseason, the method from the defaults", () => {
    expect(g.hasGame).toBe(true);
    expect(g.days.map((d) => [d.md, d.heavyReps])).toEqual([["MD-5", MATCH_WEEK_HEAVY_REPS.preseason["MD-5"]], ["MD-4", MATCH_WEEK_HEAVY_REPS.preseason["MD-4"]], ["MD-3", MATCH_WEEK_HEAVY_REPS.preseason["MD-3"]]]);
    expect(g.weekHeavyReps).toBe(27);
    expect(g.days.find((d) => d.md === "MD-4")?.structure).toBe(DEFAULT_STRUCTURE_BY_MD["MD-4"]);
  });

  it("a week without a game: noMatchWeekRule over the default weekday plan (as the delivery does)", () => {
    expect(f.hasGame).toBe(false);
    expect(f.defaultPlan).toBe(true);
    const eff = effectiveNoMatchWeek(null).week;
    const expected = FREE_WEEK.days.map((d) => noMatchWeekRule(d.date, eff, "preseason")).filter((r) => r && r.heavyReps != null).map((r) => r!.heavyReps);
    expect(f.days.map((d) => d.heavyReps)).toEqual(expected);
    expect(f.weekHeavyReps).toBeLessThanOrEqual(NO_MATCH_WEEK_HEAVY_TOTAL.preseason);
  });

  it("the team's own method per MD day wins over the default; the coach's block rule wins over the scheme", () => {
    const [own] = preseasonStrengthWeeks({
      weeks: [GAME_WEEK], blocks: BLOCKS, mdStructures: { "MD-4": "straight_sets" },
      coachRules: { block: { "transmute:preseason": { pct1rm: { en: "75–80% 1RM", is: "75–80% 1RM" } } } },
    });
    expect(own.days.find((d) => d.md === "MD-4")?.structure).toBe("straight_sets");
    expect(own.scheme.pct1rm.en).toBe("75–80% 1RM");
  });

  it("schemeHead keeps the sets × reps", () => {
    expect(schemeHead("3–4 × 8–12, moderate load, higher volume")).toBe("3–4 × 8–12");
  });

  it("every citation resolves to a real reference", () => {
    for (const c of WEEK_RULE_CITE.split(";").map((x) => x.trim())) expect(findRefByShort(c), c).toBeTruthy();
  });
});
