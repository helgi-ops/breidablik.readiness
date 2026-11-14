import { describe, expect, it } from "vitest";
import { adherence, goalOutcome, type GoalResult } from "../outcome";
import { HISTORY_MAX, buildGoalHistoryItem, isHistoryRow, planWeekOf } from "../history";
import { addDays } from "../today";
import type { Bi } from "../types";

const START = "2026-09-07"; // Monday
const END = addDays(START, 55);
const tests = { what: { en: "10 m from standing in week 1 and week 8.", is: "10 m frá kyrrstöðu í viku 1 og viku 8." }, change: { en: "A change under 2% reads as no clear change.", is: "Breyting undir 2% telst engin skýr breyting." } };
const res = (phase: GoalResult["phase"], value: number, date: string): GoalResult =>
  ({ id: `${phase}${value}`, measure: "sprint_10m_s", phase, value, test_date: date, note: null, source: "coach" });
const ticks = (n: number, done: number) => adherence(
  Array.from({ length: n }, (_, i) => ({ week: Math.floor(i / 2) + 1, slot: (i % 2 ? "B" : "A") as "A" | "B", date: addDays(START, i * 3) })),
  Array.from({ length: done }, (_, i) => ({ week: Math.floor(i / 2) + 1, slot: (i % 2 ? "B" : "A") as "A" | "B", status: "done" as const, session_date: addDays(START, i * 3) })),
  addDays(END, 30),
);
const base = { id: "p1", quality: "acceleration" as const, startDate: START, endDate: END, coachNote: null, testsWhat: tests.what, testsChange: tests.change };
const all = (b: Bi[]) => b.map((x) => `${x.en} ${x.is}`).join(" ");

describe("goal history (lota 5)", () => {
  it("only plans that ran: finished, or stopped after approval", () => {
    expect(isHistoryRow({ status: "completed", start_date: START, end_date: END })).toBe(true);
    expect(isHistoryRow({ status: "cancelled", start_date: START, end_date: END })).toBe(true);
    expect(isHistoryRow({ status: "cancelled", start_date: null, end_date: null })).toBe(false); // withdrawn request
    expect(isHistoryRow({ status: "declined", start_date: null, end_date: null })).toBe(false);
    expect(isHistoryRow({ status: "approved", start_date: START, end_date: END })).toBe(false);
    expect(HISTORY_MAX).toBe(8);
  });

  it("plan week of a date: 1–8, clamped", () => {
    expect(planWeekOf(START, START)).toBe(1);
    expect(planWeekOf(START, addDays(START, 6))).toBe(1);
    expect(planWeekOf(START, addDays(START, 7))).toBe(2);
    expect(planWeekOf(START, addDays(START, 200))).toBe(8);
    expect(planWeekOf(START, addDays(START, -3))).toBe(1);
  });

  it("finished with a start and a retest: verdict in the player's own numbers; tests behind details", () => {
    const outcome = goalOutcome("acceleration", [res("baseline", 1.92, START), res("retest", 1.87, addDays(END, -2))]);
    const h = buildGoalHistoryItem({ ...base, status: "completed", closedAt: `${END}T02:00:00Z`, outcome, adherence: ticks(16, 12) });
    expect(h.status).toBe("completed");
    expect(h.lastDay).toBe(END);
    expect(h.stoppedWeek).toBeNull();
    expect(h.verdict.en).toMatch(/^All 8 weeks done\. .*1\.92.*1\.87/);
    expect(h.verdict.is).toMatch(/^Allar 8 vikurnar búnar\./);
    expect(h.facts[0].en).toMatch(/12 of 16/);
    expect(all(h.details)).toMatch(/no AI/);
    expect(all(h.details)).toMatch(/2%/);
    expect(all(h.details)).not.toMatch(/1\.92/); // the main test is in the verdict, not repeated
  });

  it("finished without a retest: says plainly there is nothing to compare, and names the tests", () => {
    const outcome = goalOutcome("acceleration", [res("baseline", 1.92, START)]);
    const h = buildGoalHistoryItem({ ...base, status: "completed", closedAt: null, outcome, adherence: ticks(16, 3) });
    expect(h.verdict.en).toMatch(/No retest was entered/);
    expect(h.verdict.is).toMatch(/Ekkert endurpróf var skráð/);
    expect(all(h.details)).toMatch(/Tests in the plan: 10 m/);
  });

  it("stopped by the coach: the week, never the coach's reason; last day is the stop day", () => {
    const outcome = goalOutcome("acceleration", [res("baseline", 1.92, START)]);
    const stopDay = addDays(START, 17); // week 3
    const h = buildGoalHistoryItem({ ...base, status: "cancelled", closedAt: `${stopDay}T10:00:00Z`, coachNote: "Gott hjá þér", outcome, adherence: ticks(5, 4) });
    expect(h.status).toBe("stopped");
    expect(h.stoppedWeek).toBe(3);
    expect(h.lastDay).toBe(stopDay);
    expect(h.verdict).toEqual({ en: "Your coach stopped the plan in week 3.", is: "Þjálfarinn stöðvaði áætlunina í viku 3." });
    expect(h.coachNote).toBe("Gott hjá þér");
  });

  it("no session ticked: says so", () => {
    const outcome = goalOutcome("acceleration", []);
    const h = buildGoalHistoryItem({ ...base, status: "completed", closedAt: null, outcome, adherence: adherence([], [], END) });
    expect(h.facts[0]).toEqual({ en: "No sessions were ticked.", is: "Engin æfing var merkt." });
  });

  it("plain words: no colour words, no load or GPS jargon, nothing claims the plan caused anything", () => {
    const outcome = goalOutcome("acceleration", [res("baseline", 1.92, START), res("retest", 1.95, addDays(END, -2))]);
    const h = buildGoalHistoryItem({ ...base, status: "completed", closedAt: null, outcome, adherence: ticks(16, 8) });
    const text = all([h.verdict, ...h.facts, ...h.details]);
    expect(text).not.toMatch(/ACWR|composite|GPS|m\/s²|band 3|caus|prevent|predict|\(ur\)|\(n\)/i);
  });
});
