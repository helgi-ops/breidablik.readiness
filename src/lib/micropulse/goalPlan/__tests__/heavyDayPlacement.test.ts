/**
 * The heavy-day rule (2026-11-20, the coach's call): in pre-season and off-season, from the week of 30 Nov 2026, the
 * goal's gym sessions go on the week's heavy days (MD-4, MD-3), inside the team strength session, never on MD-2. The
 * 2-day gap does not count for an all-gym session on a heavy day the team lifts on; never two on one day. In season,
 * and in the weeks before, the days are placed exactly as before.
 */
import { describe, expect, it } from "vitest";
import { buildGoalPlan, GOAL_QUALITIES } from "../index";
import {
  GYM_ON_HEAVY_DAYS_FROM, addDays, buildGoalTodayCard, daysBetween, isAllGymSession, isGymSlot, placementFor,
  type PlacedSession, type TeamCalendar, type TeamDayType,
} from "../today";
import { goalPlanGymFor } from "../gymForSession";
import type { GoalPlanInput, GoalQuality } from "../types";
import { buildStructuredBlocks } from "@/lib/micropulse/strengthProgramming/structureBuilders";
import { STRUCTURE_KEYS, STRUCTURES_WITHOUT_MAIN_LIFT, teamLiftsHeavyOn } from "@/lib/micropulse/strengthProgramming/structures";

const START = "2026-11-30";
const WEEK2 = "2026-12-07";
const input = (q: GoalQuality): GoalPlanInput => ({
  quality: q, todayIso: "2026-11-27", sport: "football", isGoalkeeper: false, isActive: true, ageYears: 24,
  unavailable: false, inSeason: false, topSpeed: null, sprintTimes: null, cmj: null, strength: null, braking: null, weakerLeg: null,
});
/** Train every day but Sunday; matches on `games`. */
function cal(games: string[], over: Partial<TeamCalendar> = {}, off: string[] = []): TeamCalendar {
  const days: Record<string, TeamDayType> = {};
  for (let i = -21; i < 28; i++) {
    const d = addDays(START, i);
    days[d] = games.includes(d) ? "game" : off.includes(d) || new Date(`${d}T00:00:00Z`).getUTCDay() === 0 ? "off" : "train";
  }
  return { days, games, ...over };
}
const SAT = cal(["2026-11-28", "2026-12-05", "2026-12-12", "2026-12-19"]);
const WED_SAT = cal(["2026-12-05", "2026-12-09", "2026-12-12", "2026-12-19"]);
const plans = Object.fromEntries(GOAL_QUALITIES.map((q) => [q, buildGoalPlan(input(q))]));
const at = (q: GoalQuality, c: TeamCalendar, season?: "build" | "maintain", today = WEEK2) => placementFor(plans[q], q, START, today, c, season)!;
const bySlot = (placed: PlacedSession[]) => Object.fromEntries(placed.map((p) => [p.slot, p.md]));

describe("a Saturday match week, pre-season", () => {
  it("gym-only goals: day 1 on MD-4, day 2 on MD-3, both inside the team session", () => {
    for (const q of ["max_strength", "explosive", "strength_power"] as GoalQuality[]) {
      const p = at(q, SAT, "build");
      expect(bySlot(p.placed), q).toEqual({ A: "MD-4", B: "MD-3" });
      expect(p.placed.every((x) => x.inTeam), q).toBe(true);
    }
  });

  it("pitch goals: the gym session B on MD-4 inside the team session; braking's B on MD-3", () => {
    for (const q of ["top_speed", "acceleration", "jump"] as GoalQuality[]) {
      const p = at(q, SAT, "build");
      expect(p.placed.find((x) => x.slot === "B"), q).toMatchObject({ md: "MD-4", inTeam: true });
    }
    // Braking's B holds the braking drills (pitch work): on MD-3, and it keeps the 2-day gap.
    const br = at("braking", SAT, "build").placed.find((x) => x.slot === "B")!;
    expect(br).toMatchObject({ md: "MD-3" });
    expect(br.inTeam).toBeUndefined();
  });

  it("no heavy goal session nearer the match than MD-3", () => {
    for (const q of GOAL_QUALITIES) {
      for (const x of at(q, SAT, "build").placed) {
        if (isGymSlot(q, x.slot)) expect(["MD-4", "MD-3", "MD-5", "MD+2", "MD+3", "MD+4"], `${q} ${x.slot}`).toContain(x.md);
      }
    }
  });
});

describe("weeks with no heavy day free", () => {
  it("matches on Wednesday and Saturday: the gym sessions are left out, never put on MD-2", () => {
    for (const q of GOAL_QUALITIES) {
      const p = at(q, WED_SAT, "build");
      for (const x of p.placed) if (isGymSlot(q, x.slot)) expect(x.md, `${q} ${x.slot}`).not.toBe("MD-2");
      if (["max_strength", "explosive", "strength_power"].includes(q)) expect(p.unplaced, q).toEqual(["A", "B"]);
    }
  });

  it("the heavy days set off in the training week: the gym session goes to MD-5 or after the match, never MD-2", () => {
    const c = cal(["2026-12-05", "2026-12-12"], {}, ["2026-12-08", "2026-12-09"]);
    for (const q of GOAL_QUALITIES) {
      for (const x of at(q, c, "build").placed) if (isGymSlot(q, x.slot)) expect(x.md, `${q} ${x.slot}`).not.toBe("MD-2");
    }
  });
});

describe("the gap rule", () => {
  const calendars = [SAT, WED_SAT, cal(["2026-12-06", "2026-12-13"]), cal(["2026-12-03", "2026-12-12"]), cal([]), cal(["2026-12-10"])];
  it("two sessions are at least 2 days apart, unless one is all gym inside the team's heavy session; never on one day", () => {
    for (const q of GOAL_QUALITIES) {
      for (const c of calendars) {
        for (const today of [WEEK2, "2026-12-14"]) {
          const placed = at(q, c, "build", today).placed;
          for (let i = 0; i < placed.length; i++) {
            for (let j = i + 1; j < placed.length; j++) {
              const gap = Math.abs(daysBetween(placed[i].date, placed[j].date));
              expect(gap, `${q} ${today}`).toBeGreaterThan(0);
              if (gap < 2) expect(placed[i].inTeam || placed[j].inTeam, `${q} ${today} ${placed[i].slot}/${placed[j].slot}`).toBe(true);
            }
          }
          for (const x of placed.filter((p) => p.inTeam)) {
            expect(["MD-4", "MD-3"]).toContain(x.md);
            expect(isAllGymSession(plans[q], plans[q].weeks[1].sessions.find((s) => s.slot === x.slot)!)).toBe(true);
          }
        }
      }
    }
  });

  it("a heavy day whose method has no main lift does not hold a goal session: the gap counts again", () => {
    const c = { ...SAT, mdStructures: { "MD-4": "power_contrast", "MD-3": "iso_pap_primer" } } as TeamCalendar;
    for (const q of GOAL_QUALITIES) expect(at(q, c, "build").placed.some((x) => x.inTeam), q).toBe(false);
    const rest = { ...SAT, mdStructures: { "MD-4": "rest" } } as TeamCalendar;
    expect(at("max_strength", rest, "build").placed.find((x) => x.md === "MD-4")?.inTeam).toBeUndefined();
  });
});

describe("unchanged where the rule does not apply", () => {
  it("in season, the same week is placed exactly as before", () => {
    for (const q of GOAL_QUALITIES) {
      for (const c of [SAT, WED_SAT]) {
        const plain = at(q, c, undefined);
        const inSeason = at(q, c, "maintain");
        const withoutC = (ps: PlacedSession[]) => ps.filter((x) => x.slot !== "C");
        expect(withoutC(inSeason.placed), q).toEqual(withoutC(plain.placed));
      }
    }
  });

  it("weeks before 30 Nov 2026 keep their days, even in pre-season", () => {
    expect(GYM_ON_HEAVY_DAYS_FROM).toBe("2026-11-30");
    const start = "2026-11-16";
    const c = cal(["2026-11-21", "2026-11-28"]);
    for (const q of GOAL_QUALITIES) {
      const plan = plans[q];
      const before = placementFor(plan, q, start, "2026-11-23", c, "build")!;
      const old = placementFor(plan, q, start, "2026-11-23", c)!;
      expect(before.placed, q).toEqual(old.placed);
    }
  });
});

describe("one placement everywhere", () => {
  it("the strength engine's loader, the card and the tick read the same days in pre-season", () => {
    for (const q of GOAL_QUALITIES) {
      const plan = plans[q];
      const placed = at(q, SAT, "build").placed;
      for (let i = 0; i < 7; i++) {
        const d = addDays(WEEK2, i);
        const g = goalPlanGymFor({ planId: "x", quality: q, plan, startDate: START, todayIso: d, cal: SAT });
        const here = placed.find((x) => x.date === d && isGymSlot(q, x.slot));
        if (here) expect(g?.slot ?? "B", `${q} ${d}`).toBe(here.slot);
        else expect(g?.lifts ?? [], `${q} ${d}`).toEqual([]);
        const card = buildGoalTodayCard({ quality: q, status: "approved", plan, startDate: START, todayIso: d, cal: SAT, colour: "green", coachNote: null, season: "build" });
        expect(card?.thisWeek.filter((t) => t.date).map((t) => [t.slot, t.date]).sort(), `${q} ${d}`).toEqual(placed.map((x) => [x.slot, x.date]).sort());
      }
    }
  });

  it("the card names the rule, and says so when an all-gym session is not in today's sent session", () => {
    const q: GoalQuality = "max_strength";
    const card = buildGoalTodayCard({ quality: q, status: "approved", plan: plans[q], startDate: START, todayIso: "2026-12-08", cal: SAT, colour: "green", coachNote: null, season: "build" })!;
    expect(card.details[0].en).toMatch(/Gym sessions go on the heavy days \(MD-4, MD-3\)/);
    expect(card.facts.map((f) => f.en).join(" ")).toMatch(/belongs inside the team strength session today/);
    const merged = buildGoalTodayCard({ quality: q, status: "approved", plan: plans[q], startDate: START, todayIso: "2026-12-08", cal: SAT, colour: "green", coachNote: null, season: "build", gymInSession: "A" })!;
    expect(merged.facts.map((f) => f.en).join(" ")).not.toMatch(/belongs inside/);
    const inSeasonPitch = buildGoalTodayCard({ quality: "top_speed", status: "approved", plan: plans.top_speed, startDate: START, todayIso: "2026-12-08", cal: SAT, colour: "green", coachNote: null, season: "maintain" })!;
    expect(inSeasonPitch.details[0].en).toMatch(/at least 2 days between sessions/);
  });
});

describe("which methods hold a heavy lift", () => {
  it("the list of methods without a main lift is what the methods build", () => {
    for (const md of ["MD-4", "MD-3"] as const) {
      for (const k of STRUCTURE_KEYS) {
        const blocks = buildStructuredBlocks(k, md) ?? [];
        const main = blocks.some((b) => b.exercises.some((e) => e.category === "COMPOUND_STRENGTH"));
        expect(main, `${md} ${k}`).toBe(!STRUCTURES_WITHOUT_MAIN_LIFT.has(k));
      }
    }
  });
  it("only MD-4 and MD-3, not a rest day, and the built-in sessions count as heavy", () => {
    expect(teamLiftsHeavyOn("MD-4", undefined)).toBe(true);
    expect(teamLiftsHeavyOn("MD-3", { "MD-3": "contrast" })).toBe(true);
    expect(teamLiftsHeavyOn("MD-3", { "MD-3": "rest" })).toBe(false);
    expect(teamLiftsHeavyOn("MD-4", { "MD-4": "potentiation_cluster" })).toBe(false);
    expect(teamLiftsHeavyOn("MD-5", undefined)).toBe(false);
    expect(teamLiftsHeavyOn("MD-2", undefined)).toBe(false);
  });
});
