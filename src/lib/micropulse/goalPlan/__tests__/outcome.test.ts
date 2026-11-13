import { describe, expect, it } from "vitest";
import { buildGoalPlan } from "../index";
import {
  GOAL_MEASURES, MEASURE_DEF, QUALITY_MEASURES, adherence, goalOutcome, gpsContext, measureOutcome, parseResultInput,
  type GoalResult,
} from "../outcome";
import { addDays, buildGoalFinishedCard, buildGoalTodayCard, placedSessionsUpTo, placementFor, type TeamCalendar, type TeamDayType } from "../today";
import type { Bi, GoalPlanInput, GoalQuality } from "../types";
import { GOAL_QUALITIES } from "../types";

const input = (over: Partial<GoalPlanInput> = {}): GoalPlanInput => ({
  quality: "top_speed", todayIso: "2026-11-13", sport: "football", isGoalkeeper: false, isActive: true, ageYears: 24,
  unavailable: false, inSeason: true, topSpeed: { level: "ok", daysSince: 4, refKmh: 32, targetKmh: 28.8, confidence: "high" },
  sprintTimes: null, cmj: null, strength: null, braking: null, weakerLeg: null, ...over,
});
const planFor = (q: GoalQuality) => buildGoalPlan(input({ quality: q }));

const START = "2026-11-16"; // Monday
const END = addDays(START, 55);
let n = 0;
const r = (measure: GoalResult["measure"], phase: GoalResult["phase"], value: number, date: string, source: GoalResult["source"] = "coach"): GoalResult =>
  ({ id: `r${++n}`, measure, phase, value, test_date: date, note: null, source });

/** Saturday matches every week from a week before the start to the end; Mon–Fri train, Sun off. */
function seasonCalendar(): TeamCalendar {
  const days: Record<string, TeamDayType> = {};
  const games: string[] = [];
  for (let w = -1; w <= 8; w++) {
    const mon = addDays(START, w * 7);
    for (let i = 0; i < 5; i++) days[addDays(mon, i)] = "train";
    days[addDays(mon, 5)] = "game";
    days[addDays(mon, 6)] = "off";
    games.push(addDays(mon, 5));
  }
  return { days, games };
}

describe("entering a test result", () => {
  const args = { quality: "acceleration" as GoalQuality, startDate: START, endDate: END, todayIso: addDays(START, 10) };
  it("takes a 10 m time with a comma decimal and rounds it", () => {
    const p = parseResultInput({ measure: "sprint_10m_s", phase: "baseline", value: "1,856", testDate: START }, args);
    expect(p).toEqual({ ok: true, value: { measure: "sprint_10m_s", phase: "baseline", value: 1.856, testDate: START, note: null } });
  });
  it("only the plan's own tests, a plausible value, and a date inside the window", () => {
    expect(parseResultInput({ measure: "cmj_cm", phase: "baseline", value: 40, testDate: START }, args).ok).toBe(false);
    expect(parseResultInput({ measure: "sprint_10m_s", phase: "baseline", value: 18.5, testDate: START }, args).ok).toBe(false); // km/h typed into seconds
    expect(parseResultInput({ measure: "sprint_10m_s", phase: "middle", value: 1.9, testDate: START }, args).ok).toBe(false);
    expect(parseResultInput({ measure: "sprint_10m_s", phase: "baseline", value: 1.9, testDate: addDays(START, 11) }, args).ok).toBe(false); // future
    expect(parseResultInput({ measure: "sprint_10m_s", phase: "baseline", value: 1.9, testDate: addDays(START, -29) }, args).ok).toBe(false);
    expect(parseResultInput({ measure: "sprint_10m_s", phase: "baseline", value: 1.9, testDate: addDays(START, -28) }, args).ok).toBe(true);
  });
  it("every quality's measures exist and each measure has a clear-change mark and a source for it", () => {
    for (const q of GOAL_QUALITIES) expect(QUALITY_MEASURES[q].length).toBeGreaterThan(0);
    for (const m of GOAL_MEASURES) {
      expect(MEASURE_DEF[m].clearPct).toBeGreaterThan(0);
      expect(MEASURE_DEF[m].clearBasis.en).toMatch(/MicroPulse rule/);
    }
  });
  it("the marks match what each plan already printed in its tests section", () => {
    expect(planFor("top_speed").tests.change.en).toMatch(/1%/);
    expect(MEASURE_DEF.flying_20m_s.clearPct).toBe(1);
    expect(planFor("acceleration").tests.change.en).toMatch(/2%/);
    expect(MEASURE_DEF.sprint_10m_s.clearPct).toBe(2);
    expect(planFor("jump").tests.change.en).toMatch(/2%/);
    expect(MEASURE_DEF.cmj_cm.clearPct).toBe(2);
  });
});

describe("outcome", () => {
  it("10 m 1.86 → 1.81 s is 2.7% faster: a clear change", () => {
    const m = measureOutcome("sprint_10m_s", [r("sprint_10m_s", "baseline", 1.86, START), r("sprint_10m_s", "retest", 1.81, addDays(START, 52))]);
    expect(m.improvementPct).toBe(2.7);
    expect(m.read).toBe("clearer");
    expect(m.line.en).toBe("10 m from standing: 1.86 → 1.81 s, 2.7% faster — a clear change.");
    expect(m.line.is).toContain("1,86 → 1,81 s");
  });
  it("under the mark reads as no clear change; past it the wrong way says so", () => {
    expect(measureOutcome("sprint_10m_s", [r("sprint_10m_s", "baseline", 1.86, START), r("sprint_10m_s", "retest", 1.84, END)]).read).toBe("same");
    const w = measureOutcome("cmj_cm", [r("cmj_cm", "baseline", 40, START), r("cmj_cm", "retest", 38.8, END)]);
    expect(w.read).toBe("worse");
    expect(w.improvementPct).toBe(-3);
    expect(w.line.en).toMatch(/3\.0% lower — a clear change the wrong way/);
  });
  it("a later entry corrects an earlier one; on the same day the coach's entry beats VALD", () => {
    const rows = [
      r("cmj_cm", "baseline", 36, START, "vald"), r("cmj_cm", "baseline", 37, START, "coach"),
      r("cmj_cm", "retest", 38, addDays(START, 50)), r("cmj_cm", "retest", 39, addDays(START, 60)),
    ];
    const m = measureOutcome("cmj_cm", rows);
    expect(m.baseline?.value).toBe(37);
    expect(m.retest?.value).toBe(39);
  });
  it("missing a start or a retest: waiting, with what is there", () => {
    const o = goalOutcome("acceleration", [r("sprint_10m_s", "baseline", 1.9, START)]);
    expect(o.state).toBe("waiting");
    expect(o.measures[0].line.en).toBe("10 m from standing: 1.90 s at the start; no retest yet.");
  });
  it("top speed rests on flying 20 m, else on the top-speed test", () => {
    const o = goalOutcome("top_speed", [r("top_speed_kmh", "baseline", 31, START), r("top_speed_kmh", "retest", 31.5, END)]);
    expect(o.main).toBe("top_speed_kmh");
    expect(o.state).toBe("improved"); // +1.6% ≥ 1%
    const o2 = goalOutcome("top_speed", [
      r("top_speed_kmh", "baseline", 31, START), r("top_speed_kmh", "retest", 31.5, END),
      r("flying_20m_s", "baseline", 2.30, START), r("flying_20m_s", "retest", 2.29, END),
    ]);
    expect(o2.main).toBe("flying_20m_s");
    expect(o2.state).toBe("no_clear_change"); // 0.4%
  });
  it("never says the plan caused, prevented or predicted anything", () => {
    const all = [
      goalOutcome("braking", [r("cut_test_s", "baseline", 2.6, START), r("cut_test_s", "retest", 2.4, END)]),
      goalOutcome("jump", []),
    ];
    for (const o of all) for (const b of [o.verdict, ...o.measures.map((m) => m.line)]) {
      expect(`${b.en} ${b.is}`).not.toMatch(/caus|prevent|predict|because of the plan/i);
    }
  });
});

describe("GPS context", () => {
  const days = [
    ...[30, 31, 32, 29].map((v, i) => ({ date: addDays(START, -20 + i), value: v })),
    ...[32, 33, 31.5].map((v, i) => ({ date: addDays(START, 30 + i), value: v })),
    { date: addDays(START, 10), value: 40 }, // week 2: outside both windows
  ];
  it("same-length windows: 4 weeks before vs weeks 5–8, mean of the top 3", () => {
    const g = gpsContext("top_speed", days, START, END, END)!;
    expect(g.before).toBe(31);
    expect(g.during).toBe(32.2);
    expect(g.line.en).toMatch(/Context only/);
  });
  it("fewer than 3 days in a window: no number", () => {
    const g = gpsContext("braking", days.slice(0, 2), START, END, END)!;
    expect(g.before).toBeNull();
    expect(g.line.en).toMatch(/too few days/);
    expect(gpsContext("braking", [], START, END, END)).toBeNull();
  });
});

describe("adherence", () => {
  const due = [
    { week: 1, slot: "A" as const, date: addDays(START, 2) },
    { week: 1, slot: "B" as const, date: addDays(START, 0) },
    { week: 2, slot: "B" as const, date: addDays(START, 7) },
    { week: 2, slot: "A" as const, date: addDays(START, 9) },
  ];
  it("counts done / not done / not ticked; today's session counts only once ticked", () => {
    const today = addDays(START, 9);
    const a = adherence(due, [
      { week: 1, slot: "A", status: "done", session_date: due[0].date },
      { week: 1, slot: "B", status: "skipped", session_date: due[1].date },
    ], today);
    expect(a).toMatchObject({ due: 3, done: 1, skipped: 1, unmarked: 1 });
    expect(a.line.en).toBe("1 of 3 sessions ticked as done, 1 not done, 1 not ticked.");
    const b = adherence(due, [{ week: 2, slot: "A", status: "done", session_date: today }], today);
    expect(b).toMatchObject({ due: 4, done: 1, unmarked: 3 });
  });
  it("nothing due yet", () => {
    expect(adherence([], [], START).line.en).toBe("No session has been due yet.");
  });
});

describe("sessions placed so far", () => {
  it("each week is placed exactly as the Today card placed it", () => {
    const plan = planFor("acceleration");
    const cal = seasonCalendar();
    const until = addDays(START, 20); // week 3, Sunday
    const all = placedSessionsUpTo(plan, "acceleration", START, until, cal);
    for (let w = 1; w <= 3; w++) {
      const p = placementFor(plan, "acceleration", START, addDays(START, (w - 1) * 7), cal)!;
      expect(all.filter((s) => s.week === w).map((s) => s.date).sort()).toEqual(p.placed.map((s) => s.date).filter((d) => d <= until).sort());
    }
    expect(all.every((s) => s.date <= until)).toBe(true);
  });
});

describe("Today card ticks and the finished card", () => {
  it("today's session and this week's chips carry the tick; only today or earlier can be ticked", () => {
    const plan = planFor("acceleration");
    const cal = seasonCalendar();
    const week1 = placementFor(plan, "acceleration", START, START, cal)!;
    const first = week1.placed[0];
    const card = buildGoalTodayCard({
      quality: "acceleration", status: "approved", plan, startDate: START, todayIso: first.date, cal, colour: "green", coachNote: null,
      marks: [{ week: 1, slot: first.slot, status: "done", session_date: first.date }],
    })!;
    expect(card.today?.mark).toBe("done");
    const chip = card.thisWeek.find((s) => s.slot === first.slot)!;
    expect(chip).toMatchObject({ mark: "done", canMark: true });
    expect(card.thisWeek.filter((s) => s.date && s.date > first.date).every((s) => !s.canMark)).toBe(true);
  });

  const finished = (q: GoalQuality, rows: GoalResult[]) => buildGoalFinishedCard({
    quality: q, plan: planFor(q), endDate: END, todayIso: addDays(END, 3), outcome: goalOutcome(q, rows),
    adherence: adherence([{ week: 1, slot: "A", date: START }, { week: 1, slot: "B", date: addDays(START, 2) }], [{ week: 1, slot: "A", status: "done", session_date: START }], addDays(END, 3)),
    coachNote: null,
  })!;
  it("with a start and a retest: the change, in the player's own numbers", () => {
    const c = finished("acceleration", [r("sprint_10m_s", "baseline", 1.86, START), r("sprint_10m_s", "retest", 1.81, END)]);
    expect(c.state).toBe("finished");
    expect(c.verdict.en).toBe("Your 8 weeks are done. 10 m from standing: 1.86 → 1.81 s, 2.7% faster — a clear change.");
    expect(c.facts[0].en).toBe("1 of 2 sessions ticked as done, 1 not ticked.");
    expect(c.facts.length).toBeLessThanOrEqual(3);
  });
  it("no retest yet: the last step is the retest, with the test the plan named", () => {
    const c = finished("jump", []);
    expect(c.verdict.en).toBe("Your 8 weeks are done. Last step: the retest with your coach.");
    expect(c.facts.some((f) => /CMJ/.test(f.en))).toBe(true);
  });
  it("Icelandic copy has no gendered placeholders", () => {
    const c = finished("braking", [r("cut_test_s", "baseline", 2.6, START)]);
    const all: Bi[] = [c.verdict, ...c.facts, ...c.details];
    for (const b of all) expect(b.is).not.toMatch(/\((ur|n|in|a)\)/);
  });
});
