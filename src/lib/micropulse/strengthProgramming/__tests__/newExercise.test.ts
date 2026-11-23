/**
 * Brief §6: a new exercise (no logged set in 120 days) is shown first as a light intro in the MD-4 warm-up or in a
 * light week, before it can be a working lift; on other days it is held back. Off with no logged sets at all.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NEW_EXERCISE_EVIDENCE, NEW_EXERCISE_HELD, NEW_EXERCISE_INTRO, applyNewExerciseIntro } from "../newExercise";
import { enforceDayRules } from "../dayRules";
import { buildStrengthSession } from "..";
import type { PaletteSlots } from "../palette";
import type { MdContext, PlayerStrengthSnapshot, StrengthSession } from "../types";

const PALETTE: PaletteSlots = {
  isometric: ["ex_imtp_iso"],
  upper_body: ["ex_db_bench_press"],
  power_explosive: ["ex_box_jump", "ex_depth_jump"],
  bilateral_strength: ["ex_hip_thrust", "ex_back_squat", "ex_trap_bar_dl"],
  unilateral_strength: ["ex_bulgarian_ss"],
};
const snap = (over: Partial<PlayerStrengthSnapshot> = {}): PlayerStrengthSnapshot => ({
  playerId: "p1", todayIso: "2026-11-17", mdContext: "MD-4" as MdContext, verdict: "FULL",
  sprintSpeedDropPct: null, sprintExposureBand: null, codAsymmetryPct: null, decelBurdenBand: null, decelBurdenHighStreakDays: 0,
  wellness: { sleepQuality: null, muscleSoreness: null, fatigueEnergy: null, stressMood: null, soreAreas: [] },
  vbtDecrement: null, injuryStatus: "cleared", fosterMonotony: null, fosterStrain: null, isCongestedWeek: false,
  teamPalette: PALETTE, seasonPhase: "inseason", ...over,
});
const working = (s: StrengthSession | null) => (s?.blocks ?? []).filter((b) => b.type !== "PREP" && b.type !== "MOBILITY").flatMap((b) => b.exercises.map((e) => e.exerciseId));
const warmup = (s: StrengthSession | null) => (s?.blocks ?? []).filter((b) => b.type === "PREP").flatMap((b) => b.exercises);
const lines = (s: StrengthSession | null, id: string) => (s?.appliedAdaptations ?? []).filter((a) => a.ruleId === id);
/** A working lift the rule may hold back: not prevention, not the week rule's heavy or fast lift. */
const plainLift = (s: StrengthSession | null) => (s?.blocks ?? []).filter((b) => b.type !== "PREP" && b.type !== "MOBILITY")
  .flatMap((b) => b.exercises).find((e) => e.exerciseId !== "ex_nordic_curl" && e.exerciseId !== "ex_copenhagen" && !e.dose.weekRule && !e.dose.nearMatch)!.exerciseId;
const weekRuleLift = (s: StrengthSession | null) => (s?.blocks ?? []).flatMap((b) => b.exercises).find((e) => e.dose.weekRule || e.dose.nearMatch)!;

describe("new exercise", () => {
  const base = buildStrengthSession(snap())!;
  const all = working(base);
  const newOne = plainLift(base);
  const knownAllBut = (id: string) => [...all.filter((x) => x !== id), "ex_some_other"];

  it("off with no logged sets at all: the session is the same, byte for byte", () => {
    expect(buildStrengthSession(snap({ loggedExerciseIds: [] }))).toEqual(base);
    expect(buildStrengthSession(snap({ loggedExerciseIds: undefined }))).toEqual(base);
  });

  it("everything known: nothing changes", () => {
    expect(buildStrengthSession(snap({ loggedExerciseIds: [...all, "ex_x"] }))).toEqual(base);
  });

  it("MD-4: the new exercise leaves the working blocks and is a light 2-set intro in the warm-up", () => {
    const s = buildStrengthSession(snap({ loggedExerciseIds: knownAllBut(newOne) }))!;
    expect(working(s)).not.toContain(newOne);
    const intro = warmup(s).find((e) => e.exerciseId === newOne)!;
    expect(intro).toBeTruthy();
    expect(intro.newIntro).toBe(true);
    expect(intro.dose).toMatchObject({ sets: 2, intensity: "RPE 4–5 (light)", rest: "1 min" });
    const l = lines(s, NEW_EXERCISE_INTRO);
    expect(l).toHaveLength(1);
    expect(l[0].triggerEN).toMatch(/^New exercise: .* is not in this player's logged sets \(last 120 days\)$/);
    expect(l[0].triggerIS).toMatch(/^Ný æfing: /);
    expect(l[0].actionEN).toMatch(/light intro in the warm-up: 2 easy sets/);
    expect(l[0].actionIS).toMatch(/kynnt fyrst létt í upphituninni/);
    expect(l[0].evidence).toBe(NEW_EXERCISE_EVIDENCE);
    expect(NEW_EXERCISE_EVIDENCE).toMatch(/MicroPulse rule/);
    expect(NEW_EXERCISE_EVIDENCE).toMatch(/McHugh 2003/);
  });

  it("other days: held back with a line, never a working lift", () => {
    const md3 = buildStrengthSession(snap({ mdContext: "MD-3" }))!;
    const id = plainLift(md3);
    const s = buildStrengthSession(snap({ mdContext: "MD-3", loggedExerciseIds: [...working(md3).filter((x) => x !== id), "ex_x"] }))!;
    expect(working(s)).not.toContain(id);
    expect(warmup(s).some((e) => e.exerciseId === id)).toBe(false);
    expect(lines(s, NEW_EXERCISE_HELD)[0].actionEN).toMatch(/left out today: a new exercise comes in first as a light intro on MD-4 or in a light week\.$/);
    expect(lines(s, NEW_EXERCISE_HELD)[0].actionIS).toMatch(/sleppt í dag/);
  });

  it("a light (deload) week is an intro day too", () => {
    const md3 = buildStrengthSession(snap({ mdContext: "MD-3", goalSeason: { phase: "preseason", blockGoal: "deload" } }))!;
    const id = plainLift(md3);
    const s = buildStrengthSession(snap({ mdContext: "MD-3", goalSeason: { phase: "preseason", blockGoal: "deload" }, loggedExerciseIds: [...working(md3).filter((x) => x !== id), "ex_x"] }))!;
    expect(warmup(s).some((e) => e.exerciseId === id && e.newIntro)).toBe(true);
    expect(lines(s, NEW_EXERCISE_INTRO)[0].actionEN).toMatch(/this light week's warm-up/);
  });

  it("injury prevention and the coach's own swap are never held back", () => {
    const s = buildStrengthSession(snap({ loggedExerciseIds: ["ex_x"] }))!;
    expect(working(s)).toContain("ex_nordic_curl");
    const session: StrengthSession = {
      playerId: "p", mdContext: "MD-3", templateId: "t", durationMin: 10, vbtAutoRegulated: false, isCompressed: false,
      blocks: [{ id: "c", titleEN: "C", titleIS: "C", type: "COMPOUND", exercises: [
        { exerciseId: "ex_back_squat", nameEN: "Back squat", nameIS: "Hnébeygja", category: "COMPOUND_STRENGTH", dose: { sets: 3, reps: "3", intensity: "80% 1RM", rest: "3 min" }, modificationReason: "Coach swap" },
        { exerciseId: "ex_copenhagen", nameEN: "Copenhagen", nameIS: "Copenhagen", category: "ADDUCTOR", dose: { sets: 3, reps: "6 each side", intensity: "BW", rest: "1 min" } },
      ] }],
      appliedAdaptations: [], summaryEN: "", summaryIS: "", confidence: 0.5,
    };
    expect(applyNewExerciseIntro(session, { loggedExerciseIds: ["ex_x"] })).toBe(session);
  });

  it("stable: the day rules again change nothing; a second pass adds nothing", () => {
    const s = buildStrengthSession(snap({ loggedExerciseIds: knownAllBut(newOne) }))!;
    expect(enforceDayRules(s)?.blocks).toEqual(s.blocks);
    expect(applyNewExerciseIntro(s, { loggedExerciseIds: knownAllBut(newOne) })).toEqual(s);
  });

  it("yellow is never more than green with an intro in it", () => {
    const g = buildStrengthSession(snap({ loggedExerciseIds: knownAllBut(newOne) }))!;
    const y = buildStrengthSession(snap({ verdict: "MODIFIED", loggedExerciseIds: knownAllBut(newOne) }))!;
    const n = (s: StrengthSession) => working(s).length;
    expect(n(y)).toBeLessThanOrEqual(n(g));
  });
});

describe("wiring", () => {
  const root = join(__dirname, "..");
  it("one read for the 1RMs and the logged exercises; no extra query; never the readiness colour", () => {
    const loader = readFileSync(join(root, "loader.ts"), "utf8");
    expect(loader.match(/from\("player_strength_set_log"\)/g)).toHaveLength(1);
    expect(loader).toMatch(/snapshot\.loggedExerciseIds = loggedIds/);
    const rule = readFileSync(join(root, "newExercise.ts"), "utf8");
    expect(rule).not.toMatch(/final_color|readiness_entries|supabase/);
  });
});

describe("the week rule's lifts: learn it and do it the same day (2026-11-23)", () => {
  for (const md of ["MD-4", "MD-3", "MD-2"] as const) {
    it(`${md}: a new heavy / fast lift stays as the working lift, with 2 light sets in the warm-up first`, () => {
      // MD-2 by default has no loaded fast lift (iso primer); the coach's potentiation cluster has one.
      const struct = md === "MD-2" ? { mdStructures: { "MD-2": "potentiation_cluster" } as never } : {};
      const base = buildStrengthSession(snap({ mdContext: md, ...struct }))!;
      const lift = weekRuleLift(base);
      const others = working(base).filter((x) => x !== lift.exerciseId);
      const s = buildStrengthSession(snap({ mdContext: md, ...struct, loggedExerciseIds: [...others, "ex_x"] }))!;
      const kept = (s.blocks ?? []).filter((b) => b.type !== "PREP").flatMap((b) => b.exercises).find((e) => e.exerciseId === lift.exerciseId)!;
      expect(kept.dose.sets).toBe(lift.dose.sets);
      expect(kept.dose.reps).toBe(lift.dose.reps);
      expect(warmup(s).some((e) => e.exerciseId === lift.exerciseId && e.newIntro && e.dose.sets === 2)).toBe(true);
      const l = lines(s, NEW_EXERCISE_INTRO).find((a) => a.triggerEN.includes(lift.nameEN))!;
      expect(l.actionEN).toMatch(/is new: 2 easy sets in the warm-up to learn it first, then today's working sets \(the week rule's dose holds\)\.$/);
      expect(l.actionIS).toMatch(/skammtur vikureglunnar heldur/);
      expect(lines(s, NEW_EXERCISE_HELD).some((a) => a.triggerEN.includes(lift.nameEN))).toBe(false);
      // A second pass adds nothing.
      expect(applyNewExerciseIntro(s, { loggedExerciseIds: [...others, "ex_x"] })).toEqual(s);
    });
  }
});
