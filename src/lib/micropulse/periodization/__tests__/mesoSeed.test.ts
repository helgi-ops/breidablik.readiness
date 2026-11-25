import { describe, it, expect } from "vitest";
import { buildPreseasonProposal } from "../preseasonProposal";
import { type MatchUnit, type SeasonPhase } from "../index";
import { assumedWeekMove, mesoSeedFromEcho, mesoWeekFor, preseasonInputFor, seasonMesoBlocks, teamCalendarUnit, type SeedPlan } from "../mesoSeed";
import { planDaysFromCalWeek } from "../mesoWeek";

const m = (typical: number | null) => ({ typical, peak: typical });
const UNIT = {
  nNearFull: 10, nInWindow: 10, fellBack: false, confidence: "high", windowNote: { en: "", is: "" }, minutesTypical: 90,
  load: m(1000), distance: m(10000), hsr: m(600), sprint: m(150), accel: m(40), decel: m(45),
  accHiEff: m(20), decHiEff: m(22), stride: m(30), rhie: m(null), symmetry: m(null), metPower: m(null), imaCod: m(55), imaFr: m(2400),
} as unknown as MatchUnit;
const phase = (key: string, start: string, end: string, weeks: number): SeasonPhase =>
  ({ key, label: { en: key, is: key }, start, end, weeks, matches: 0, rationale: { en: "", is: "" } }) as SeasonPhase;
const LEAGUE = ["2026-04-11", "2026-04-18", "2026-04-25", "2026-05-02", "2026-05-09", "2026-05-16"];
const PLAN: SeedPlan = {
  seasonYear: 2026, nextSeasonYear: 2027,
  phases: [phase("preseason", "2026-02-02", "2026-04-10", 10), phase("competitive", "2026-04-10", "2026-10-25", 28), phase("offseason", "2026-10-25", "2026-11-30", 5)],
  fixtures: LEAGUE, upcomingFixtures: ["2027-01-16", "2027-02-06"], nextFirstFixture: "2027-04-05",
  loadCurve: [], matchLoad: 1000, matchLoadTeam: 20000, matchSrpe: 700, tier: { loadSource: "gps" },
  players: [{ matchUnit: UNIT, vald: { status: "green" } }],
  teamBaseline: { avg: { matchDistanceM: 10000, matchHsrM: 600, matchPlayerLoad: 1000, matchAccel: 40, matchDecel: 45, direction: { forward: 0.6, backward: 0.2, lateral: 0.2 } } },
};

describe("mesoSeedFromEcho — the standalone page reads the week the hub's Micro tab reads", () => {
  const echo = {
    plan: PLAN, deloadCadence: 4,
    savedWindow: { stepPct: 5, blockGoals: {}, blockWeeks: {}, blockDeload: {} },
    savedWindowNext: { preseasonSessions: 5, preGamesFrom: "2027-01-09", preAssumedGames: { "2027-03-01": 3 }, blockWeeks: {}, blockGoals: {}, deloadCadence: 4 },
    weekPlans: [{ day_date: "2026-04-14", day_type: "OFF", focus: "MD+3" }],
  };
  const s = mesoSeedFromEcho(echo, { teamBreaks: [], camps: [], today: "2026-11-25" });

  it("pre-season week = the next season's pre-season plan (its settings row), with its assumed game", () => {
    const unit = teamCalendarUnit(PLAN.teamBaseline?.avg);
    const input = preseasonInputFor(PLAN, {
      today: "2026-11-25", unit, savedDays: { "2026-04-14": { dayType: "OFF", focus: "MD+3" } }, camps: [], cadence: 4, blockWeeks: {}, blockGoals: {}, baseOverloadPct: 100, stepPct: 5, aerobicMode: s.preInput.aerobicMode!,
      settings: { sessionsPerWeek: 5, week1MatchMultiple: s.preInput.settingsOverride!.week1MatchMultiple, week1Kpi: {}, mesoTail: null, taperPct: s.preInput.settingsOverride!.taperPct, gamesFrom: "2027-01-09", assumedGames: { "2027-03-01": 3 } },
    });
    const ref = buildPreseasonProposal(input)!;
    const wk = ref.weeks.find((w) => w.assumedGame && !w.assumedGame.coachSet)!;
    const got = mesoWeekFor(s.ctx, wk.weekStart)!;
    expect(got.source).toBe("preseason");
    expect(got.days).toEqual(planDaysFromCalWeek(ref.engine.cal.weeks.find((w) => w.weekStart === wk.weekStart)!));
    expect(got.assumedGame).toEqual(wk.assumedGame);
    // The coach's move (Thursday) is read from the next season's row.
    const moved = mesoWeekFor(s.ctx, "2027-03-01")!;
    expect(moved.assumedGame).toEqual({ date: "2027-03-04", coachSet: true });
    expect(moved.days[3].day_type).toBe("GAME");
    expect(s.preYear).toBe(2027);
  });

  it("in-season week: games only on the fixtures, the saved day reads back, outside the Meso window → null", () => {
    const w = mesoWeekFor(s.ctx, "2026-04-13")!;
    expect(w.source).toBe("inseason");
    expect(w.days.filter((d) => d.day_type === "GAME").map((d) => d.day_date)).toEqual(["2026-04-18"]);
    expect(w.days[1].day_type).toBe("OFF");
    expect(w.assumedGame).toBeNull();
    // The block list is the hub's (same slicing call).
    expect(s.ctx.mesoBlocks).toEqual(seasonMesoBlocks(PLAN, { cadence: 4, teamBreaks: [], offseasonStart: null, blockWeeks: {}, blockDeload: {} }));
    expect(mesoWeekFor(s.ctx, "2025-01-06")).toBeNull();
  });

  it("'No game this week' re-flows the week with no game", () => {
    const wk = s.ctx.preProp!.weeks.find((x) => x.assumedGame && !x.assumedGame.coachSet)!;
    const mv = assumedWeekMove(s.preInput, wk.weekStart, { ...s.assumedGames, [wk.weekStart]: null })!;
    expect(mv.week.week_start).toBe(wk.weekStart);
    expect(mv.week.days.some((d) => d.day_type === "GAME")).toBe(false);
  });
});
