import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildGoalPlan } from "../index";
import { addDays, buildGoalTodayCard, type TeamCalendar } from "../today";
import type { GoalPlanInput } from "../types";
import {
  GOAL_PLAN_PAUSED_IN_SEASON, IN_SEASON_PAUSE_TEXT, UNKNOWN_SEASON, cardSeasonOf, goalSyncAction, mondayOf,
  needsSync, nextPreseasonStart, pausedReasonOf, phaseOfWord, startGate, type GoalSeasonRead, type SyncInputRow,
} from "../seasonPause";
import { buildStrengthSession } from "@/lib/micropulse/strengthProgramming";
import { withGoalPlanGym } from "@/lib/micropulse/strengthProgramming/goalPlanGym";
import { goalPlanGymFor } from "../gymForSession";
import { placementFor, type TeamDayType } from "../today";
import type { MdContext, PlayerStrengthSnapshot } from "@/lib/micropulse/strengthProgramming/types";
import type { PaletteSlots } from "@/lib/micropulse/strengthProgramming/palette";

const COMPETITIVE: GoalSeasonRead = { season: "maintain", phase: "competitive", nextPreseason: "2027-11-29", source: "season_plan_block" };
const PRESEASON: GoalSeasonRead = { season: "build", phase: "preseason", nextPreseason: null, source: "season_plan_block" };
const OFFSEASON: GoalSeasonRead = { season: "build", phase: "offseason", nextPreseason: null, source: "week_phase" };

const approved = (over: Partial<SyncInputRow> = {}): SyncInputRow => ({
  status: "approved", start_date: "2027-04-05", end_date: "2027-05-30", ...over,
});
const free = (season: GoalSeasonRead | null) => ({ unavailable: false, season });

describe("goal plans pause in season (GOAL_PLAN_PAUSED_IN_SEASON)", () => {
  it("a competitive date pauses a running plan for the season, with the plan week", () => {
    expect(goalSyncAction(approved(), free(COMPETITIVE), "2027-04-21")).toEqual({ kind: "pause", reason: "in_season", week: 3 });
  });

  it("a build date (pre-season / off-season) leaves it running", () => {
    expect(goalSyncAction(approved(), free(PRESEASON), "2027-04-21")).toEqual({ kind: "none" });
    expect(goalSyncAction(approved(), free(OFFSEASON), "2027-04-21")).toEqual({ kind: "none" });
  });

  it("season not known → unchanged (today's behaviour); not read → unchanged", () => {
    expect(goalSyncAction(approved(), free(UNKNOWN_SEASON), "2027-04-21")).toEqual({ kind: "none" });
    expect(goalSyncAction(approved(), free(null), "2027-04-21")).toEqual({ kind: "none" });
    expect(cardSeasonOf(UNKNOWN_SEASON)).toBe("maintain"); // the old two-state read: unknown counted as maintain
    expect(cardSeasonOf(PRESEASON)).toBe("build");
  });

  it("a plan that has not started yet stays approved (its card says when it starts)", () => {
    expect(goalSyncAction(approved({ start_date: "2027-11-29", end_date: "2028-01-23" }), free(COMPETITIVE), "2027-06-01")).toEqual({ kind: "none" });
  });

  it("injury comes first; the 8 weeks over → completed first of all", () => {
    expect(goalSyncAction(approved(), { unavailable: true, season: COMPETITIVE }, "2027-04-21")).toEqual({ kind: "pause", reason: "injury", week: 3 });
    expect(goalSyncAction(approved(), free(COMPETITIVE), "2027-06-02")).toEqual({ kind: "complete" });
  });

  it("the coach's in-season restart (logged override) is left alone", () => {
    expect(goalSyncAction(approved({ season_override_at: "2027-04-20T10:00:00Z" }), free(COMPETITIVE), "2027-04-21")).toEqual({ kind: "none" });
  });

  it("resumes on its own at pre-season — week 1 after the long break — not in the off-season", () => {
    const paused = approved({ status: "paused", paused_reason: "in_season", paused_week: 3, paused_at: "2027-04-21T09:00:00Z" });
    expect(goalSyncAction(paused, free(OFFSEASON), "2027-11-10")).toEqual({ kind: "none" });
    expect(goalSyncAction(paused, free(COMPETITIVE), "2027-09-01")).toEqual({ kind: "none" });
    // Wednesday 1 Dec 2027 in pre-season → week 1 from Monday 29 Nov.
    expect(goalSyncAction(paused, free(PRESEASON), "2027-12-01")).toEqual({ kind: "resume", start: "2027-11-29", fromWeek: 1, resumeMonday: "2027-11-29" });
  });

  it("a short season pause picks up where it paused", () => {
    const paused = approved({ status: "paused", paused_reason: "in_season", paused_week: 4, paused_at: "2027-11-20T09:00:00Z" });
    // 10 days later, Wednesday 1 Dec: week 4 runs from this Monday → start 3 weeks earlier.
    expect(goalSyncAction(paused, free(PRESEASON), "2027-11-30")).toEqual({ kind: "resume", start: "2027-11-08", fromWeek: 4, resumeMonday: "2027-11-29" });
  });

  it("pre-season starts while the player is injured → the injury pause (the coach restarts it)", () => {
    const paused = approved({ status: "paused", paused_reason: "in_season", paused_week: 3, paused_at: "2027-04-21T09:00:00Z" });
    expect(goalSyncAction(paused, { unavailable: true, season: PRESEASON }, "2027-12-01")).toEqual({ kind: "to_injury" });
  });

  it("an injury pause never resumes on its own (old rows without a reason count as injury)", () => {
    for (const paused_reason of ["injury", null]) {
      const r = approved({ status: "paused", paused_reason, paused_week: 3, paused_at: "2027-04-21T09:00:00Z" });
      expect(goalSyncAction(r, free(PRESEASON), "2027-12-01")).toEqual({ kind: "none" });
      expect(pausedReasonOf(r)).toBe("injury");
      expect(needsSync(r)).toBe(false);
    }
    expect(needsSync({ status: "paused", paused_reason: "in_season" })).toBe(true);
    expect(needsSync({ status: "approved" })).toBe(true);
  });
});

describe("a new plan in season starts at the next pre-season", () => {
  it("moved to the Monday of the next pre-season", () => {
    expect(startGate(COMPETITIVE, "2027-04-26")).toEqual({ kind: "moved_to_preseason", start: "2027-11-29", chosen: "2027-04-26", preseason: "2027-11-29" });
    // A pre-season that opens on a Tuesday (Breiðablik: 1 Dec 2026) → the Monday of that week.
    expect(startGate({ ...COMPETITIVE, nextPreseason: "2026-12-01" }, "2026-06-10").start).toBe("2026-11-30");
  });
  it("a chosen start already in pre-season stays", () => {
    expect(startGate(COMPETITIVE, "2027-12-06")).toEqual({ kind: "as_chosen", start: "2027-12-06" });
  });
  it("no saved plan with the next pre-season → approved, then paused until it starts", () => {
    expect(startGate({ ...COMPETITIVE, nextPreseason: null }, "2027-04-26")).toEqual({ kind: "pause_until_preseason", start: "2027-04-26" });
  });
  it("build and unknown → as chosen", () => {
    expect(startGate(PRESEASON, "2027-01-04")).toEqual({ kind: "as_chosen", start: "2027-01-04" });
    expect(startGate(UNKNOWN_SEASON, "2027-01-04")).toEqual({ kind: "as_chosen", start: "2027-01-04" });
    expect(startGate(null, "2027-01-04")).toEqual({ kind: "as_chosen", start: "2027-01-04" });
  });
  it("the next pre-season from the plan phases; the phase words", () => {
    const phases = [
      { key: "preseason", start: "2026-11-30" }, { key: "competitive", start: "2027-04-10" },
      { key: "offseason", start: "2027-10-20" }, { key: "preseason", start: "2027-11-29" },
    ];
    expect(nextPreseasonStart(phases, "2027-05-01")).toBe("2027-11-29");
    expect(nextPreseasonStart(phases, "2027-12-01")).toBeNull();
    expect(mondayOf("2027-11-29")).toBe("2027-11-29");
    expect(mondayOf("2027-12-02")).toBe("2027-11-29");
    expect(phaseOfWord("inseason")).toBe("competitive");
    expect(phaseOfWord("pre-season")).toBe("preseason");
    expect(phaseOfWord(null)).toBeNull();
  });
});

const input = (over: Partial<GoalPlanInput> = {}): GoalPlanInput => ({
  quality: "top_speed", todayIso: "2026-11-13", sport: "football", isGoalkeeper: false, isActive: true, ageYears: 24,
  unavailable: false, inSeason: false, topSpeed: { level: "ok", daysSince: 4, refKmh: 32, targetKmh: 28.8, confidence: "high" },
  sprintTimes: null, cmj: null, strength: null, braking: null, weakerLeg: null, ...over,
});
const EMPTY: TeamCalendar = { days: {}, games: [] };

describe("the player's card", () => {
  it("in-season pause: the rule's text, no session, nothing to tick", () => {
    const plan = buildGoalPlan(input());
    const c = buildGoalTodayCard({
      quality: "top_speed", status: "paused", plan, startDate: "2027-04-05", todayIso: "2027-05-01", cal: EMPTY, colour: "green",
      coachNote: null, pausedWeek: 3, pausedReason: "in_season", nextPreseason: "2027-11-29",
    })!;
    expect(c.state).toBe("paused");
    expect(c.verdict).toEqual(IN_SEASON_PAUSE_TEXT);
    expect(c.verdict.en).toBe("Goal plans pause in-season (maintenance period). Your plan resumes next pre-season.");
    expect(c.verdict.is).toBe("Markmiðsplön eru í bið á keppnistímabili (viðhaldstímabil). Planið heldur áfram næsta undirbúningstímabil.");
    expect(c.today).toBeNull();
    expect(c.thisWeek).toEqual([]);
    expect(c.facts.map((f) => f.en).join(" ")).toMatch(/week 3 of 8.*Pre-season starts on/);
  });
  it("injury pause keeps its own text", () => {
    const c = buildGoalTodayCard({
      quality: "top_speed", status: "paused", plan: buildGoalPlan(input()), startDate: "2027-04-05", todayIso: "2027-05-01", cal: EMPTY,
      colour: null, coachNote: null, pausedWeek: 3, pausedReason: "injury",
    })!;
    expect(c.verdict.en).toMatch(/injured or coming back/);
  });
});

// ─── The strength session on a competitive date holds no goal blocks ───────

const MON = "2026-11-16";
function saturdayWeek(): TeamCalendar {
  const days: Record<string, TeamDayType> = {};
  for (const w of [-7, 0]) {
    for (let i = 0; i < 5; i++) days[addDays(MON, w + i)] = "train";
    days[addDays(MON, w + 5)] = "game";
    days[addDays(MON, w + 6)] = "off";
  }
  return { days, games: [addDays(MON, -2), addDays(MON, 5)] };
}
const PALETTE: PaletteSlots = {
  isometric: ["ex_imtp_iso"], upper_body: ["ex_db_bench_press"], power_explosive: ["ex_box_jump", "ex_depth_jump"],
  bilateral_strength: ["ex_hip_thrust", "ex_back_squat"], unilateral_strength: ["ex_reverse_lunge"],
};
const snap = (over: Partial<PlayerStrengthSnapshot> = {}): PlayerStrengthSnapshot => ({
  playerId: "p1", todayIso: MON, mdContext: "MD-4" as MdContext, verdict: "FULL",
  sprintSpeedDropPct: null, sprintExposureBand: null, codAsymmetryPct: null, decelBurdenBand: null, decelBurdenHighStreakDays: 0,
  wellness: { sleepQuality: null, muscleSoreness: null, fatigueEnergy: null, stressMood: null, soreAreas: [] },
  vbtDecrement: null, injuryStatus: "cleared", fosterMonotony: null, fosterStrain: null, isCongestedWeek: false,
  teamPalette: PALETTE, seasonPhase: null, goalSeason: { phase: "preseason", blockGoal: "transmute" }, ...over,
});

describe("the strength session", () => {
  const cal = saturdayWeek();
  const plan = buildGoalPlan(input({ quality: "acceleration" }));
  const bDay = placementFor(plan, "acceleration", MON, MON, cal)!.placed.find((p) => p.slot === "B")!.date;
  const gym = goalPlanGymFor({ planId: "plan1", quality: "acceleration", plan, startDate: MON, todayIso: bDay, cal })!;
  const goalBlocks = (s: ReturnType<typeof buildStrengthSession>) => (s?.blocks ?? []).flatMap((b) => b.exercises).filter((e) => e.goalPlan);

  it("competitive date → no goal blocks, no goal rule", () => {
    const s = buildStrengthSession(withGoalPlanGym(snap({ goalSeason: { phase: "competitive", blockGoal: "accum" } }), gym));
    expect(goalBlocks(s)).toEqual([]);
    expect((s?.appliedAdaptations ?? []).some((a) => a.ruleId.startsWith("GOAL_PLAN_GYM"))).toBe(false);
  });
  it("build date → merged (the existing merge)", () => {
    expect(goalBlocks(buildStrengthSession(withGoalPlanGym(snap(), gym))).length).toBeGreaterThan(0);
  });
});

describe("wiring", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
  it("the sync never writes the readiness colour; the rule id is on its events", () => {
    const store = read("src/lib/micropulse/goalPlan/store.ts");
    expect(store).not.toMatch(/readiness_entries/);
    expect(store).toMatch(/seasonDetail/);
    expect(GOAL_PLAN_PAUSED_IN_SEASON).toBe("GOAL_PLAN_PAUSED_IN_SEASON");
    expect(read("src/lib/micropulse/goalPlan/seasonPause.ts")).not.toMatch(/readiness_entries|final_color/);
  });
  it("the migration exists for paused_reason and the coach's season override", () => {
    const sql = read("supabase/migrations/20261122170000_goal_plan_paused_reason.sql");
    expect(sql).toMatch(/paused_reason/);
    expect(sql).toMatch(/season_override_at/);
  });
});
