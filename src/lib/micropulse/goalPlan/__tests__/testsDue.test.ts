import { describe, expect, it } from "vitest";
import type { GoalResult } from "../outcome";
import { BASELINE_ASK_UNTIL_DAY, RETEST_ASK_FROM_DAY, buildGoalTestDue, goalTestNeed, inTestWindow, retestWhen } from "../testsDue";
import { addDays } from "../today";
import { deriveGoalTestsSignal } from "../../coachSignals";

const START = "2026-11-02"; // Monday
const END = addDays(START, 55);
const plan = (over: Partial<Parameters<typeof goalTestNeed>[0]> = {}) =>
  ({ status: "approved" as const, quality: "acceleration" as const, start_date: START, end_date: END, ...over });
const res = (measure: GoalResult["measure"], phase: GoalResult["phase"], source: GoalResult["source"] = "coach"): GoalResult =>
  ({ id: `${measure}-${phase}`, measure, phase, value: 1.9, test_date: START, note: null, source });

describe("which goal plans need a test (lota 6)", () => {
  it("start test: asked from the start date to the end of week 3, only while approved", () => {
    expect(goalTestNeed(plan(), [], addDays(START, -1))).toBeNull(); // not started
    expect(goalTestNeed(plan(), [], START)).toBe("baseline");
    expect(goalTestNeed(plan(), [], addDays(START, BASELINE_ASK_UNTIL_DAY))).toBe("baseline");
    expect(goalTestNeed(plan(), [], addDays(START, BASELINE_ASK_UNTIL_DAY + 1))).toBeNull(); // week 4–6: quiet
    expect(goalTestNeed(plan({ status: "paused" }), [], addDays(START, 3))).toBeNull();
    expect(goalTestNeed(plan({ status: "cancelled" }), [], addDays(START, 3))).toBeNull();
    expect(goalTestNeed(plan({ status: "requested" }), [], addDays(START, 3))).toBeNull();
  });

  it("a start result on any of the plan's tests clears it; another quality's test does not", () => {
    expect(goalTestNeed(plan(), [res("sprint_10m_s", "baseline")], addDays(START, 2))).toBeNull();
    expect(goalTestNeed(plan(), [res("cmj_cm", "baseline")], addDays(START, 2))).toBe("baseline");
    expect(goalTestNeed(plan({ quality: "braking" }), [res("cut_test_s", "baseline")], addDays(START, 2))).toBeNull();
    expect(goalTestNeed(plan({ quality: "jump" }), [res("cmj_cm", "baseline", "vald")], addDays(START, 2))).toBeNull(); // VALD counts
  });

  it("retest: from week 7 while approved, and up to 3 weeks after a finished plan; retest wins over a missing start", () => {
    expect(goalTestNeed(plan(), [], addDays(START, RETEST_ASK_FROM_DAY - 1))).toBeNull();
    expect(goalTestNeed(plan(), [], addDays(START, RETEST_ASK_FROM_DAY))).toBe("retest");
    expect(goalTestNeed(plan({ status: "completed" }), [], addDays(END, 21))).toBe("retest");
    expect(goalTestNeed(plan({ status: "completed" }), [], addDays(END, 22))).toBeNull();
    expect(inTestWindow(plan({ status: "completed" }), addDays(END, 22))).toBe(false);
    expect(goalTestNeed(plan({ status: "completed" }), [res("sprint_10m_s", "retest")], addDays(END, 3))).toBeNull();
  });

  it("days to the end and the plain wording", () => {
    const d = buildGoalTestDue({ ...plan(), id: "g1", player_id: "p1", name: "Jón Þór" }, [], addDays(END, -4))!;
    expect(d).toMatchObject({ need: "retest", daysToEnd: 4, name: "Jón Þór" });
    expect(retestWhen(4)).toEqual({ en: "4 days left", is: "4 dagar eftir" });
    expect(retestWhen(21).is).toBe("21 dagur eftir");
    expect(retestWhen(1).is).toBe("lýkur á morgun");
    expect(retestWhen(0).en).toBe("ends today");
    expect(retestWhen(-1)).toEqual({ en: "ended 1 day ago", is: "lauk fyrir 1 degi" });
    expect(retestWhen(-3).is).toBe("lauk fyrir 3 dögum");
  });
});

describe("deriveGoalTestsSignal (Today chip + morning digest)", () => {
  const due = (over: Partial<NonNullable<ReturnType<typeof buildGoalTestDue>>> = {}) => ({
    planId: "g1", playerId: "p1", name: "Jón Þór", quality: "acceleration" as const, need: "retest" as const,
    startDate: START, endDate: END, daysToEnd: 4, ...over,
  });
  it("nothing due → steady (no chip)", () => {
    expect(deriveGoalTestsSignal([]).level).toBe("steady");
  });
  it("a task with both lists, first names, high confidence, links to Goal requests", () => {
    const s = deriveGoalTestsSignal([due(), due({ planId: "g2", playerId: "p2", name: "Anna Lísa", quality: "jump", need: "baseline" })]);
    expect(s.engine).toBe("goal_tests");
    expect(s.level).toBe("task");
    expect(s.confidence).toBe("high");
    expect(s.href).toBe("/coach/goal-requests");
    // One line, because the morning digest shows only a signal's first line.
    expect(s.why.en).toEqual(["Retest due: Jón (acceleration, 4 days left) · Start test missing: Anna (vertical jump)"]);
    expect(s.why.is).toEqual(["Endurpróf á dagskrá: Jón (hröðun, 4 dagar eftir) · Upphafspróf vantar: Anna (lóðrétt stökk)"]);
    expect(s.counterfactual?.en).toMatch(/MicroPulse/);
  });
  it("more than 4 names: +n", () => {
    const s = deriveGoalTestsSignal(Array.from({ length: 6 }, (_, i) => due({ planId: `g${i}`, playerId: `p${i}`, name: `P${i} X` })));
    expect(s.why.en[0]).toMatch(/\+2$/);
  });
});
