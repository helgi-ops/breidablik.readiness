import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildGoalPlan } from "../index";
import { PLAN_BASIS, PLAN_BASIS_OUT_OF_SEASON, inSeasonFor } from "../common";
import { addDays, buildGoalTodayCard, placedSessionsUpTo, placementFor, planHasSessionC, type TeamCalendar, type TeamDayType } from "../today";
import type { GoalPlanInput, GoalQuality } from "../types";
import { GOAL_QUALITIES, isGymQuality } from "../types";

// 2026-11-18: goal plans are built by the team's real season. Before, every plan was built as the in-season version
// (2 a week), also in off-season and pre-season.

const input = (over: Partial<GoalPlanInput> = {}): GoalPlanInput => ({
  quality: "top_speed", todayIso: "2026-11-18", sport: "football", isGoalkeeper: false, isActive: true, ageYears: 24,
  unavailable: false, inSeason: true, topSpeed: { level: "ok", daysSince: 4, refKmh: 32, targetKmh: 28.8, confidence: "high" },
  sprintTimes: null, cmj: null, strength: null, braking: null, weakerLeg: null, ...over,
});
const PITCH: GoalQuality[] = GOAL_QUALITIES.filter((q) => !isGymQuality(q));
const GYM: GoalQuality[] = GOAL_QUALITIES.filter((q) => isGymQuality(q));

describe("inSeasonFor — the season a new plan is built for", () => {
  it("pre-season and off-season (build) → out of season; in season and not known → in season", () => {
    expect(inSeasonFor("build")).toBe(false);
    expect(inSeasonFor("maintain")).toBe(true);
    expect(inSeasonFor("unknown")).toBe(true);
    expect(inSeasonFor(null)).toBe(true);
    expect(inSeasonFor(undefined)).toBe(true);
  });
});

describe("buildGoalPlan — out of season", () => {
  it("pitch goals: 3 a week, session C in some weeks, the verdict and basis say so", () => {
    for (const q of PITCH) {
      const p = buildGoalPlan(input({ quality: q, inSeason: false }));
      expect(p.status, q).toBe("ok");
      expect(p.sessionsPerWeek, q).toBe(3);
      expect(planHasSessionC(p), q).toBe(true);
      const cWeeks = p.weeks.filter((w) => w.sessions.some((s) => s.slot === "C")).length;
      expect(p.verdict.en, q).toContain(`Out of season: plus a short third session`);
      expect(p.verdict.en, q).toContain(`in ${cWeeks} of the 8 weeks`);
      expect(p.verdict.is, q).toContain("Utan tímabils");
      expect(p.basis, q).toEqual(PLAN_BASIS_OUT_OF_SEASON);
      for (const w of p.weeks) for (const s of w.sessions.filter((x) => x.slot === "C")) expect(s.minutes, q).toBeLessThanOrEqual(12);
    }
  });

  it("A and B are the same as the in-season plan's: only session C is added", () => {
    for (const q of PITCH) {
      const off = buildGoalPlan(input({ quality: q, inSeason: false }));
      const on = buildGoalPlan(input({ quality: q, inSeason: true }));
      const ab = (p: typeof off) => p.weeks.map((w) => w.sessions.filter((s) => s.slot !== "C"));
      expect(ab(off), q).toEqual(ab(on));
    }
  });

  it("in season: 2 a week, no session C, the old basis and verdict", () => {
    for (const q of PITCH) {
      const p = buildGoalPlan(input({ quality: q, inSeason: true }));
      expect(p.sessionsPerWeek, q).toBe(2);
      expect(planHasSessionC(p), q).toBe(false);
      expect(p.verdict.en, q).not.toContain("third session");
      expect(p.basis, q).toEqual(PLAN_BASIS);
    }
  });

  it("gym-only goals stay at 2 goal days a week in and out of season", () => {
    for (const q of GYM) for (const inSeason of [true, false]) {
      const p = buildGoalPlan(input({ quality: q, inSeason }));
      expect(p.sessionsPerWeek, q).toBe(2);
      expect(planHasSessionC(p), q).toBe(false);
      expect(p.basis, q).toEqual(PLAN_BASIS);
    }
  });

  it("acceleration: the in-season-only lines are left out out of season", () => {
    const off = buildGoalPlan(input({ quality: "acceleration", inSeason: false }));
    const on = buildGoalPlan(input({ quality: "acceleration", inSeason: true }));
    const text = (p: typeof off) => p.limits.map((l) => l.en).join(" | ");
    expect(text(on)).toContain("Expect smaller gains in season");
    expect(text(on)).toContain("short add-on in season");
    expect(text(off)).not.toContain("Expect smaller gains in season");
    expect(text(off)).toContain("short add-on to the team's training");
  });
});

const MON = "2026-12-07"; // a Monday in pre-season
/** A pre-season week with no match: Mon–Fri training, weekend off (and the same the week before). */
function noMatchWeek(): TeamCalendar {
  const days: Record<string, TeamDayType> = {};
  for (const w of [-7, 0]) {
    for (let i = 0; i < 5; i++) days[addDays(MON, w + i)] = "train";
    days[addDays(MON, w + 5)] = "off";
    days[addDays(MON, w + 6)] = "off";
  }
  return { days, games: [] };
}

describe("session C on Today — out of season only", () => {
  const plan = buildGoalPlan(input({ quality: "top_speed", inSeason: false }));
  const start = MON; // week 1
  it("out of season (build) a week without a match places A, B and C, at least 2 days apart", () => {
    const p = placementFor(plan, "top_speed", start, MON, noMatchWeek(), "build")!;
    expect(p.placed.map((x) => x.slot).sort()).toEqual(["A", "B", "C"]);
    const dates = p.placed.map((x) => x.date).sort();
    for (let i = 1; i < dates.length; i++) expect(Date.parse(dates[i]) - Date.parse(dates[i - 1])).toBeGreaterThanOrEqual(2 * 86_400_000);
  });

  it("in season (maintain) session C is left out; A and B go on, and the card says why", () => {
    const p = placementFor(plan, "top_speed", start, MON, noMatchWeek(), "maintain")!;
    expect(p.placed.map((x) => x.slot).sort()).toEqual(["A", "B"]);
    const card = buildGoalTodayCard({ quality: "top_speed", status: "approved", plan, startDate: start, todayIso: MON, cal: noMatchWeek(), colour: null, coachNote: null, season: "maintain" })!;
    expect(card.thisWeek.map((s) => s.slot).sort()).toEqual(["A", "B"]);
    expect(card.details.map((d) => d.en).join(" ")).toContain("the short third session is left out");
    const build = buildGoalTodayCard({ quality: "top_speed", status: "approved", plan, startDate: start, todayIso: MON, cal: noMatchWeek(), colour: null, coachNote: null, season: "build" })!;
    expect(build.thisWeek.map((s) => s.slot).sort()).toEqual(["A", "B", "C"]);
    expect(build.details.map((d) => d.en).join(" ")).not.toContain("third session is left out");
  });

  it("adherence counts the sessions placed by the same rule", () => {
    const until = addDays(MON, 6);
    expect(placedSessionsUpTo(plan, "top_speed", start, until, noMatchWeek(), "build").some((s) => s.slot === "C")).toBe(true);
    expect(placedSessionsUpTo(plan, "top_speed", start, until, noMatchWeek(), "maintain").some((s) => s.slot === "C")).toBe(false);
  });

  it("a plan without C (every plan before 2026-11-18) places the same whatever the season", () => {
    const old = buildGoalPlan(input({ quality: "top_speed", inSeason: true }));
    const a = placementFor(old, "top_speed", start, MON, noMatchWeek(), "build");
    const b = placementFor(old, "top_speed", start, MON, noMatchWeek(), "maintain");
    const c = placementFor(old, "top_speed", start, MON, noMatchWeek());
    expect(a).toEqual(c);
    expect(b).toEqual(c);
  });
});

describe("wiring — the season is read when a plan is built and when a plan with C is shown", () => {
  const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
  it("loadGoalPlanBase reads the team's season; no hard-coded in-season build", () => {
    const s = read("src/lib/micropulse/goalPlan/loader.ts");
    expect(s).toMatch(/goalSeasonForTeam\(sb, teamId, todayIso\)/);
    expect(s).toMatch(/inSeason: inSeasonFor\(season\)/);
    const base = s.slice(s.indexOf("export async function loadGoalPlanBase"), s.indexOf("export async function loadGoalPlanPreview"));
    expect(base).not.toMatch(/inSeason: true/);
  });
  it("Today, ticks, the coach's week view and adherence pass the season", () => {
    const t = read("src/lib/micropulse/goalPlan/todayLoader.ts");
    expect(t.match(/goalSeasonForPlan\(/g)?.length).toBe(3);
    const pr = read("src/lib/micropulse/goalPlan/progressLoader.ts");
    // Every plan reads the season since 2026-11-20 (the heavy-day rule places the gym sessions in pre-/off-season).
    expect(pr).toMatch(/goalSeasonForTeam\(sb, teamId, until\)/);
    expect(pr).toMatch(/placedSessionsUpTo\(row\.plan, row\.quality, row\.start_date, until, cal, season\)/);
  });
});
