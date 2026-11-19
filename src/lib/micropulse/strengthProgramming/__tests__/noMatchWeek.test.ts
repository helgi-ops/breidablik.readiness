/**
 * Weeks without a match (2026-11-17): the coach's weekday plan says what each day is (strength / power / light /
 * rest); the method comes from the MD-4 / MD-3 / MD-2 rows. Individualised modes only, no match near only.
 */
import { describe, expect, it } from "vitest";
import { buildStrengthSession } from "../index";
import { NO_MATCH_DAY_MD, noMatchDayFor, sanitizeNoMatchWeek, weekdayOf } from "../structures";
import { isGoalDay } from "../playerGoal";
import type { MdContext, PlayerStrengthSnapshot } from "../types";
import { addDays, placeWeek, type TeamCalendar } from "@/lib/micropulse/goalPlan/today";

const MON = "2026-11-16";
const snap = (over: Partial<PlayerStrengthSnapshot> = {}): PlayerStrengthSnapshot => ({
  playerId: "p1", todayIso: MON, mdContext: "MD-3" as MdContext, verdict: "FULL",
  sprintSpeedDropPct: null, sprintExposureBand: null, codAsymmetryPct: null, decelBurdenBand: null, decelBurdenHighStreakDays: 0,
  wellness: { sleepQuality: null, muscleSoreness: null, fatigueEnergy: null, stressMood: null, soreAreas: [] },
  vbtDecrement: null, injuryStatus: "cleared", fosterMonotony: null, fosterStrain: null, isCongestedWeek: false,
  ...over,
});
const rule = (s: ReturnType<typeof buildStrengthSession>, id: string) => (s?.appliedAdaptations ?? []).find((a) => a.ruleId === id);
const WEEK = sanitizeNoMatchWeek({ mon: "strength", tue: "rest", wed: "power", thu: "rest", fri: "light" });

describe("the weekday plan (pure)", () => {
  it("reads the weekday of a calendar date", () => {
    expect(weekdayOf("2026-11-16")).toBe("mon");
    expect(weekdayOf("2026-11-22")).toBe("sun");
    expect(weekdayOf("2026-12-31")).toBe("thu");
    expect(weekdayOf("not a date")).toBeNull();
  });

  it("keeps only weekday → kind; anything else is dropped", () => {
    expect(sanitizeNoMatchWeek({ mon: "strength", tue: "heavy", xyz: "rest", sun: "rest", wed: 3 })).toEqual({ mon: "strength", sun: "rest" });
    expect(sanitizeNoMatchWeek(null)).toEqual({});
    expect(sanitizeNoMatchWeek(["strength"])).toEqual({});
  });

  it("finds the day kind; unset → null", () => {
    expect(noMatchDayFor(MON, WEEK)).toBe("strength");
    expect(noMatchDayFor(addDays(MON, 4), WEEK)).toBe("light");
    expect(noMatchDayFor(addDays(MON, 5), WEEK)).toBeNull();
    expect(noMatchDayFor(MON, undefined)).toBeNull();
  });
});

describe("the engine", () => {
  const nm = (iso: string, over: Partial<PlayerStrengthSnapshot> = {}) => snap({ todayIso: iso, noMatchNearby: true, noMatchWeek: WEEK, ...over });

  it("a strength / power / light day builds as MD-4 / MD-3 / MD-2, with the day's name and why", () => {
    for (const [i, kind] of [[0, "strength"], [2, "power"], [4, "light"]] as const) {
      const s = buildStrengthSession(nm(addDays(MON, i)))!;
      expect(s.mdContext).toBe(NO_MATCH_DAY_MD[kind]);
      expect(s.mdContext).toBe(buildStrengthSession(snap({ mdContext: NO_MATCH_DAY_MD[kind] }))!.mdContext);
      expect(s.templateId).toBe(buildStrengthSession(snap({ mdContext: NO_MATCH_DAY_MD[kind] }))!.templateId);
      expect(rule(s, "NO_MATCH_WEEK_DAY")?.triggerIS).toMatch(/Enginn leikur í vikunni/);
    }
    expect(buildStrengthSession(nm(MON))!.contextLabel).toBe("Strength day");
  });

  it("the method comes from that MD row (one place to pick a method)", () => {
    const s = buildStrengthSession(nm(MON, { mdStructures: { "MD-4": "straight_sets" } }))!;
    expect(s.templateId).toBe("struct-straight_sets-MD-4");
    expect(rule(s, "NO_MATCH_WEEK_DAY")?.actionEN).toMatch(/Compound|straight/i);
  });

  it("a rest day → no session", () => {
    expect(buildStrengthSession(nm(addDays(MON, 1)))).toBeNull();
  });

  it("a match-week Off marker on that MD row is not used, and no volume concentration rides along", () => {
    const s = buildStrengthSession(nm(MON, { mdStructures: { "MD-4": "rest", "MD-2": "rest" } }))!;
    expect(s).not.toBeNull();
    expect(Object.values(s.mdStructures ?? {})).not.toContain("rest");
  });

  it("unchanged: a team with no weekday plan, a match near (or a hand-picked day), standard mode, basketball", () => {
    // No weekday plan at all → the day is built as before (the MD-3 default).
    const base = buildStrengthSession(snap({ todayIso: addDays(MON, 5), noMatchNearby: true }));
    expect(buildStrengthSession(snap({ todayIso: addDays(MON, 5), noMatchNearby: true, noMatchWeek: {} }))).toEqual(base);
    expect(rule(base, "WEEK_RULE_HEAVY_REPS")).toBeUndefined();
    // A weekday the plan leaves out (Saturday) is a light day since the week rule (2026-11-19); before, a full MD-3 session.
    const sat = buildStrengthSession(nm(addDays(MON, 5)))!;
    expect(sat.mdContext).toBe("MD-2");
    expect(rule(sat, "WEEK_RULE_LIGHT_DAY")?.triggerEN).toMatch(/not in the weekday plan/);
    // A match near: noMatchNearby is absent → the MD day stands.
    expect(buildStrengthSession(snap({ noMatchWeek: WEEK }))).toEqual(buildStrengthSession(snap()));
    // Standard mode: the team's own programme, no weekday plan.
    expect(buildStrengthSession(nm(MON), [], { mode: "standard" })).toEqual(buildStrengthSession(snap({ noMatchNearby: true }), [], { mode: "standard" }));
    expect(buildStrengthSession(nm(addDays(MON, 1)), [], { mode: "standard" })).not.toBeNull();
    // Basketball has no MD week: unchanged.
    expect(buildStrengthSession(nm(addDays(MON, 1), { sport: "basketball" }))).toEqual(buildStrengthSession(snap({ todayIso: addDays(MON, 1), noMatchNearby: true, sport: "basketball" })));
  });

  it("the player's strength goal: every strength session in a no-match week, except a light day", () => {
    expect(isGoalDay("stronger", { mdContext: "MD-4", noMatchNearby: true }, "build")).toBe(true);
    expect(isGoalDay("stronger", { mdContext: "MD-3", noMatchNearby: true }, "build")).toBe(true);
    expect(isGoalDay("stronger", { mdContext: "MD-2", noMatchNearby: true }, "build")).toBe(false);
  });
});

describe("where the 8-week goal's session B goes in a no-match week", () => {
  const trainWeek = (): TeamCalendar => {
    const days: TeamCalendar["days"] = {};
    for (let i = 0; i < 5; i++) days[addDays(MON, i)] = "train";
    return { days, games: [] };
  };

  it("unset: as before (Thursday first)", () => {
    const p = placeWeek({ quality: "acceleration", slots: ["A", "B"], monday: MON, cal: trainWeek() });
    expect(p.placed.find((x) => x.slot === "B")?.date).toBe(addDays(MON, 3));
  });

  it("on a strength or power day (session A keeps its own best day); a light or rest day only when nothing else is free; 2 days apart holds", () => {
    const cal = { ...trainWeek(), noMatchWeek: sanitizeNoMatchWeek({ mon: "light", tue: "strength", wed: "light", thu: "rest", fri: "power" }) };
    const p = placeWeek({ quality: "acceleration", slots: ["A", "B"], monday: MON, cal });
    const a = p.placed.find((x) => x.slot === "A")!.date;
    const b = p.placed.find((x) => x.slot === "B")!.date;
    // A (the pitch work) takes Tuesday, its best day; B then goes on Friday's power day, not a light or rest day.
    expect([addDays(MON, 1), addDays(MON, 4)]).toContain(b);
    // Only B: the strength day.
    expect(placeWeek({ quality: "acceleration", slots: ["B"], monday: MON, cal }).placed[0].date).toBe(addDays(MON, 1));
    expect(Math.abs((Date.parse(a) - Date.parse(b)) / 86400000)).toBeGreaterThanOrEqual(2);

    const onlyPower = { ...trainWeek(), noMatchWeek: sanitizeNoMatchWeek({ mon: "rest", tue: "light", wed: "rest", thu: "power", fri: "rest" }) };
    expect(placeWeek({ quality: "jump", slots: ["A", "B"], monday: MON, cal: onlyPower }).placed.find((x) => x.slot === "B")?.date).toBe(addDays(MON, 3));
  });
});

describe("a week under way keeps its days for session B", () => {
  it("the plan places B by the weekday plan only from the week after it changed", () => {
    const days: TeamCalendar["days"] = {};
    for (const w of [0, 7]) for (let i = 0; i < 5; i++) days[addDays(MON, w + i)] = "train";
    const noMatchWeek = sanitizeNoMatchWeek({ mon: "strength", thu: "light" });
    const thisWeek = placeWeek({ quality: "acceleration", slots: ["B"], monday: MON, cal: { days, games: [], noMatchWeek, noMatchWeekSince: addDays(MON, 1) } });
    expect(thisWeek.placed[0].date).toBe(addDays(MON, 3)); // as before: Thursday
    const nextWeek = placeWeek({ quality: "acceleration", slots: ["B"], monday: addDays(MON, 7), cal: { days, games: [], noMatchWeek, noMatchWeekSince: addDays(MON, 1) } });
    expect(nextWeek.placed[0].date).toBe(addDays(MON, 7)); // the strength day
  });

  it("stores `since` only when the days change", async () => {
    const { noMatchWeekToStore, noMatchWeekSince } = await import("../structures");
    const a = noMatchWeekToStore({ mon: "strength" }, {}, "2026-11-17");
    expect(a).toEqual({ mon: "strength", since: "2026-11-17" });
    expect(noMatchWeekToStore({ mon: "strength" }, a, "2026-11-20")).toEqual(a);
    expect(noMatchWeekToStore({ mon: "power" }, a, "2026-11-20").since).toBe("2026-11-20");
    expect(noMatchWeekSince({ since: "bad" })).toBeNull();
    expect(sanitizeNoMatchWeek(a)).toEqual({ mon: "strength" });
  });
});
