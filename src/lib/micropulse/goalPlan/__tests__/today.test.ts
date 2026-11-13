import { describe, expect, it } from "vitest";
import { buildGoalPlan } from "../index";
import {
  MIN_GAP_DAYS, addDays, buildGoalTodayCard, daysBetween, isHardBlock, mdLabel, mondayOf, placeWeek, planWeekOn,
  sessionForColour, toDayColour, type TeamCalendar, type TeamDayType,
} from "../today";
import { parseDecision, resumeDefaultWeek, resumedStartDate } from "../requests";
import type { Bi, GoalPlanInput, GoalQuality } from "../types";
import { GOAL_QUALITIES } from "../types";

const input = (over: Partial<GoalPlanInput> = {}): GoalPlanInput => ({
  quality: "top_speed", todayIso: "2026-11-13", sport: "football", isGoalkeeper: false, isActive: true, ageYears: 24,
  unavailable: false, inSeason: true, topSpeed: { level: "ok", daysSince: 4, refKmh: 32, targetKmh: 28.8, confidence: "high" },
  sprintTimes: null, cmj: null, strength: null, braking: null, weakerLeg: null, ...over,
});
const planFor = (q: GoalQuality, over: Partial<GoalPlanInput> = {}) => buildGoalPlan(input({ quality: q, ...over }));

const MON = "2026-11-16"; // a Monday
const day = (i: number) => addDays(MON, i);
/** Saturday matches (last week and this week); Mon–Fri training, Sat game, Sun off. */
function saturdayWeek(): TeamCalendar {
  const days: Record<string, TeamDayType> = {};
  for (const w of [-7, 0]) {
    for (let i = 0; i < 5; i++) days[addDays(MON, w + i)] = "train";
    days[addDays(MON, w + 5)] = "game";
    days[addDays(MON, w + 6)] = "off";
  }
  return { days, games: [day(-2), day(5)] };
}

describe("dates", () => {
  it("monday and plan week", () => {
    expect(mondayOf("2026-11-22")).toBe(MON);
    expect(mondayOf(MON)).toBe(MON);
    expect(planWeekOn(MON, day(-1))).toBe(0);
    expect(planWeekOn(MON, MON)).toBe(1);
    expect(planWeekOn(MON, day(13))).toBe(2);
    expect(planWeekOn(MON, day(55))).toBe(8);
    expect(planWeekOn(MON, day(56))).toBe(9);
  });
  it("match-day labels follow the strength engine's order", () => {
    const g = [day(-2), day(5)];
    expect([0, 1, 2, 3, 4, 5, 6].map((i) => mdLabel(day(i), g))).toEqual(["MD+2", "MD-4", "MD-3", "MD-2", "MD-1", "MD", "MD+1"]);
    expect(mdLabel(MON, [])).toBeNull();
  });
});

describe("day placement", () => {
  it("Saturday match week: top speed A on MD-3 (Wed), gym B on MD+2 (Mon)", () => {
    const p = placeWeek({ quality: "top_speed", slots: ["A", "B"], monday: MON, cal: saturdayWeek() });
    expect(p.unplaced).toEqual([]);
    expect(p.placed.find((x) => x.slot === "A")).toMatchObject({ date: day(2), md: "MD-3" });
    expect(p.placed.find((x) => x.slot === "B")).toMatchObject({ date: day(0), md: "MD+2" });
  });

  it("braking: A after the match (MD+2/+3), B on MD-2", () => {
    const p = placeWeek({ quality: "braking", slots: ["A", "B"], monday: MON, cal: saturdayWeek() });
    expect(p.placed.find((x) => x.slot === "A")?.md).toBe("MD+2");
    expect(p.placed.find((x) => x.slot === "B")?.md).toBe("MD-2");
  });

  it("never on a match day, the day before or after, a rest or recovery day; always 2+ days apart", () => {
    const cals: TeamCalendar[] = [
      saturdayWeek(),
      { ...saturdayWeek(), days: { ...saturdayWeek().days, [day(1)]: "recovery", [day(3)]: "off" } },
      { days: {}, games: [day(2), day(5)] },
      { days: {}, games: [] },
      { days: {}, games: [day(0), day(3), day(6)] },
    ];
    for (const cal of cals) for (const q of GOAL_QUALITIES) for (const slots of [["A", "B"], ["A", "B", "C"]] as const) {
      const p = placeWeek({ quality: q, slots: [...slots], monday: MON, cal });
      for (const s of p.placed) {
        expect(["MD", "MD-1", "MD+1"]).not.toContain(s.md);
        const t = cal.days[s.date];
        expect(t === undefined || t === "train").toBe(true);
      }
      for (const a of p.placed) for (const b of p.placed) if (a !== b) expect(Math.abs(daysBetween(a.date, b.date))).toBeGreaterThanOrEqual(MIN_GAP_DAYS);
      expect(p.placed.length + p.unplaced.length).toBe(slots.length);
    }
  });

  it("two matches in a week (Wed + Sat): only Monday is free, so session B is left out", () => {
    const p = placeWeek({ quality: "acceleration", slots: ["A", "B"], monday: MON, cal: { days: {}, games: [day(-2), day(2), day(5)] } });
    expect(p.placed.map((x) => x.date)).toEqual([day(0)]);
    expect(p.unplaced).toEqual(["B"]);
  });

  it("no team week set: any day away from a match counts, and it says so", () => {
    const p = placeWeek({ quality: "jump", slots: ["A", "B"], monday: MON, cal: { days: {}, games: [] } });
    expect(p.weekKnown).toBe(false);
    expect(p.placed).toHaveLength(2);
  });

  it("keeps the 2-day gap across Sunday → Monday", () => {
    const p = placeWeek({ quality: "jump", slots: ["A", "B"], monday: MON, cal: { days: {}, games: [] }, prevLast: day(-1) });
    for (const s of p.placed) expect(daysBetween(day(-1), s.date)).toBeGreaterThanOrEqual(MIN_GAP_DAYS);
  });
});

describe("today's version by colour (the colour is only read)", () => {
  it("red → skip; green or no check-in → full", () => {
    const s = planFor("acceleration").weeks[1].sessions[0];
    expect(sessionForColour(s, "red").version).toBe("skip");
    expect(sessionForColour(s, "green")).toMatchObject({ version: "full", blocks: s.blocks });
    expect(sessionForColour(s, null).version).toBe("full");
  });

  it("yellow leaves out every flat-out, sled, hard-stop, box-drop and test block, in every plan", () => {
    for (const q of GOAL_QUALITIES) for (const age of [24, 16]) {
      const plan = planFor(q, { ageYears: age, braking: { overloadFlag: "green", codAsymHighPct: null, codLean: null } });
      if (plan.status !== "ok") continue;
      for (const w of plan.weeks) for (const s of w.sessions) {
        const v = sessionForColour(s, "yellow");
        expect(v.blocks.some(isHardBlock)).toBe(false);
        expect(v.blocks.some((b) => b.test || b.topSpeed || b.dropJumps || (b.sledM ?? 0) > 0 || (b.hardStops ?? 0) > 0)).toBe(false);
        if (v.version === "skip") expect(v.blocks).toEqual([]);
      }
    }
  });

  it("a top-speed sprint session on a yellow day is skipped, not turned into something else", () => {
    const s = planFor("top_speed").weeks[3].sessions[0];
    expect(sessionForColour(s, "yellow").version).toBe("skip");
  });

  it("reads only green / yellow / red", () => {
    expect(toDayColour("YELLOW")).toBe("yellow");
    expect(toDayColour("amber")).toBeNull();
  });
});

describe("the Today card", () => {
  const plan = planFor("top_speed");
  const card = (todayIso: string, colour: "green" | "yellow" | "red" | null, startDate = MON) =>
    buildGoalTodayCard({ quality: "top_speed", status: "approved", plan, startDate, todayIso, cal: saturdayWeek(), colour, coachNote: null });

  it("before the start: when it starts", () => {
    const c = card(day(-3), null)!;
    expect(c.state).toBe("not_started");
    expect(c.verdict.en).toContain("Mon 16 Nov");
  });

  it("on the session day: the session in today's version", () => {
    expect(card(day(2), "green")!.today).toMatchObject({ slot: "A", version: "full" });
    expect(card(day(2), "red")!.today?.version).toBe("skip");
    expect(card(day(2), "red")!.verdict.en).toMatch(/^Skip/);
    expect(card(day(2), null)!.facts.some((f) => f.en.includes("No check-in"))).toBe(true);
  });

  it("on another day: says the next one", () => {
    const c = card(day(1), "green")!;
    expect(c.today).toBeNull();
    expect(c.verdict.en).toContain("Next: Wed");
    expect(c.facts.length).toBeGreaterThanOrEqual(1);
    expect(c.facts.length).toBeLessThanOrEqual(3);
  });

  it("after week 8: no card; paused: says so and that the coach restarts it", () => {
    expect(card(day(56), "green")).toBeNull();
    const p = buildGoalTodayCard({ quality: "top_speed", status: "paused", plan, startDate: MON, todayIso: day(20), cal: saturdayWeek(), colour: "green", coachNote: null, pausedWeek: 3 })!;
    expect(p.state).toBe("paused");
    expect(p.today).toBeNull();
    expect(p.verdict.en).toContain("coach restarts");
  });

  it("player wording: no gendered Icelandic forms, no injury claims, no jargon in the verdict and facts", () => {
    const texts: Bi[] = [];
    for (let i = -3; i < 60; i++) for (const c of ["green", "yellow", "red", null] as const) {
      const x = card(day(i), c);
      if (x) texts.push(x.verdict, ...x.facts, ...x.details);
    }
    for (const b of texts) {
      expect(b.is).not.toMatch(/\((ur|n|in|ir)\)/);
      expect(`${b.en} ${b.is}`).not.toMatch(/prevent|predict|causes injur/i);
    }
    const front = texts.filter((_, i) => i % 1 === 0).map((b) => b.en).join(" ");
    expect(front).not.toMatch(/ACWR|composite|neural load|\bHIR\b/);
  });
});

describe("restarting a paused plan", () => {
  it("picks up at the paused week, or week 1 after more than 21 days", () => {
    expect(resumeDefaultWeek(4, "2026-11-10T09:00:00Z", "2026-11-20")).toBe(4);
    expect(resumeDefaultWeek(4, "2026-10-01T09:00:00Z", "2026-11-20")).toBe(1);
    expect(resumeDefaultWeek(0, null, "2026-11-20")).toBe(1);
  });
  it("the plan's first Monday moves back so the chosen week lands on the restart Monday", () => {
    expect(resumedStartDate("2026-11-30", 3)).toBe("2026-11-16");
    expect(planWeekOn(resumedStartDate("2026-11-30", 3), "2026-11-30")).toBe(3);
  });
  it("parseDecision: resume needs a Monday (this week's may be in the past) and a week 1–8", () => {
    expect(parseDecision({ action: "resume", startDate: "2026-11-16", fromWeek: 2 }, "2026-11-19", null)).toMatchObject({ ok: true });
    expect(parseDecision({ action: "resume", startDate: "2026-11-09", fromWeek: 2 }, "2026-11-19", null).ok).toBe(false);
    expect(parseDecision({ action: "resume", startDate: "2026-11-23", fromWeek: 9 }, "2026-11-19", null).ok).toBe(false);
    expect(parseDecision({ action: "approve", startDate: "2026-11-16" }, "2026-11-19", null).ok).toBe(false);
  });
});

describe("real calendars (Nov 2026 shapes)", () => {
  it("a week with only a GAME row is not a set week: the other days still count", () => {
    const p = placeWeek({ quality: "jump", slots: ["A", "B"], monday: MON, cal: { days: { [day(1)]: "game" }, games: [day(1)] } });
    expect(p.weekKnown).toBe(false);
    expect(p.placed.length).toBe(2);
  });
  it("a whole week off: nothing placed, and the card says the team is not training (not a busy match week)", () => {
    const off: TeamCalendar = { days: Object.fromEntries(Array.from({ length: 14 }, (_, i) => [addDays(MON, i - 7), "off" as TeamDayType])), games: [] };
    expect(placeWeek({ quality: "jump", slots: ["A", "B"], monday: MON, cal: off })).toMatchObject({ placed: [], teamDays: 0 });
    const c = buildGoalTodayCard({ quality: "jump", status: "approved", plan: planFor("jump"), startDate: MON, todayIso: day(2), cal: off, colour: "green", coachNote: null })!;
    expect(c.verdict.en).toContain("not training");
    expect(c.facts[0].en).not.toContain("match");
  });
});
