/**
 * Brief §6, priority: the injury-prevention add-ons always apply; then one main goal, never two — enforced when a goal
 * plan is approved or started, and logged on the approval event.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GOAL_PRIORITY_EVIDENCE, GOAL_PRIORITY_RULE, oneMainGoalCheck } from "../mainGoalRule";
import { buildGoalPlan } from "../index";
import { gymLiftsOf } from "../gymForSession";
import type { GoalPlanInput, GoalQuality, GoalSessionSlot } from "../types";
import { buildStrengthSession } from "@/lib/micropulse/strengthProgramming";
import { withGoalPlanGym, type GoalPlanGym } from "@/lib/micropulse/strengthProgramming/goalPlanGym";
import type { MdContext, PlayerStrengthSnapshot } from "@/lib/micropulse/strengthProgramming/types";

describe("one main goal", () => {
  it("a second open plan blocks the approval, in words, in English and Icelandic", () => {
    const c = oneMainGoalCheck([{ id: "a", quality: "top_speed", status: "approved" }], "b", "max_strength");
    expect(c.ok).toBe(false);
    if (c.ok) return;
    expect(c.en).toBe("This player already has a main goal (Top speed, running). One main goal at a time: stop that plan first.");
    expect(c.is).toBe("Leikmaðurinn er nú þegar með aðalmarkmið (Hámarkshraði, í gangi). Eitt aðalmarkmið í einu: stöðvaðu það plan fyrst.");
    // A paused plan is still the main goal.
    expect(oneMainGoalCheck([{ id: "a", quality: "jump", status: "paused" }], null, "jump").ok).toBe(false);
  });

  it("the plan being approved does not count against itself; the rule is logged with its source", () => {
    const c = oneMainGoalCheck([{ id: "b", quality: "max_strength", status: "requested" }], "b", "max_strength");
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(c.adaptation).toMatchObject({ ruleId: GOAL_PRIORITY_RULE, triggerEN: "Goal plan approved: Maximal strength", triggerIS: "Markmiðsplan samþykkt: Hámarksstyrkur" });
    expect(c.adaptation.actionEN).toMatch(/one main goal.*injury-prevention add-ons .* still apply first/);
    expect(c.adaptation.actionIS).toMatch(/eina aðalmarkmiðið/);
    expect(GOAL_PRIORITY_EVIDENCE).toMatch(/MicroPulse rule/);
    expect(GOAL_PRIORITY_EVIDENCE).toMatch(/van Dyk et al\. 2019/);
    expect(GOAL_PRIORITY_EVIDENCE).toMatch(/Harøy et al\. 2019/);
  });
});

describe("prevention first, with a goal merged", () => {
  const input = (q: GoalQuality): GoalPlanInput => ({
    quality: q, todayIso: "2026-11-13", sport: "football", isGoalkeeper: false, isActive: true, ageYears: 24,
    unavailable: false, inSeason: false, topSpeed: null, sprintTimes: null, cmj: null, strength: null, braking: null, weakerLeg: null,
  });
  const gymOf = (q: GoalQuality, slot: GoalSessionSlot): GoalPlanGym => {
    const r = gymLiftsOf(buildGoalPlan(input(q)), 2, slot)!;
    return { planId: "x", quality: q, slot, week: 2, weeksTotal: 8, labelEN: r.session.focus.en, labelIS: r.session.focus.is, lifts: r.lifts };
  };
  const snap = (md: MdContext): PlayerStrengthSnapshot => ({
    playerId: "p1", todayIso: "2027-01-05", mdContext: md, verdict: "FULL",
    sprintSpeedDropPct: null, sprintExposureBand: null, codAsymmetryPct: null, decelBurdenBand: null, decelBurdenHighStreakDays: 0,
    wellness: { sleepQuality: null, muscleSoreness: null, fatigueEnergy: null, stressMood: null, soreAreas: [] },
    vbtDecrement: null, injuryStatus: "cleared", fosterMonotony: null, fosterStrain: null, isCongestedWeek: false,
    seasonPhase: null, goalSeason: { phase: "preseason", blockGoal: "transmute" },
  });
  const ids = (md: MdContext, q: GoalQuality, slot: GoalSessionSlot) =>
    (buildStrengthSession(withGoalPlanGym(snap(md), gymOf(q, slot)), [], { mode: "individualised" })?.blocks ?? []).flatMap((b) => b.exercises.map((e) => e.exerciseId));

  it("Nordic stays on MD-4 and Copenhagen on MD-3 whatever the goal", () => {
    for (const q of ["max_strength", "explosive", "strength_power"] as GoalQuality[]) {
      expect(ids("MD-4", q, "A"), q).toContain("ex_nordic_curl");
      expect(ids("MD-3", q, "B"), q).toContain("ex_copenhagen");
    }
  });
});

describe("wiring", () => {
  const store = readFileSync(join(__dirname, "..", "store.ts"), "utf8");
  it("approval and the coach's start check the rule first and log it; never the readiness colour", () => {
    const approve = store.slice(store.indexOf('if (d.action === "approve")'), store.indexOf('if (d.action === "resume")'));
    expect(approve).toMatch(/oneMainGoalCheck\(await openGoalsForPlayer\(sb, args\.teamId, row\.player_id\), row\.id, row\.quality\)/);
    expect(approve.indexOf("oneMainGoalCheck")).toBeLessThan(approve.indexOf(".update("));
    expect(approve).toMatch(/priority_rule: priority\.adaptation/);
    const coach = store.slice(store.indexOf("export async function startGoalByCoach"), store.indexOf("export async function decideGoal"));
    expect(coach).toMatch(/oneMainGoalCheck\(open \? \[open\] : \[\], null, args\.quality\)/);
    expect(coach).toMatch(/priority_rule: priority\.adaptation/);
    expect(store).toMatch(/priorityExtra\(\[\], row\.id, args\.quality\)/);
    expect(store).not.toMatch(/final_color|readiness_entries/);
  });
});
