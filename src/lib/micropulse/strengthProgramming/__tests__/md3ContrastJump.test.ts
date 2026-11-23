/**
 * Contradiction 4 (2026-11-23): on MD-3 a light loaded jump in a contrast round counts as jump contacts, not loaded
 * reps, so the week rule's heavy reps (9 in pre-season, 6 in season) and the jump's rounds both stay. No cluster on MD-3.
 */
import { describe, expect, it } from "vitest";
import { buildStrengthSession } from "..";
import { CONTRAST_JUMP_MAX_PCT, isContrastJump } from "../dayRules";
import { STRUCTURES_ALLOWED_BY_MD } from "../structures";
import type { MdContext, PlayerStrengthSnapshot, StrengthSession } from "../types";

const snap = (over: Partial<PlayerStrengthSnapshot> = {}): PlayerStrengthSnapshot => ({
  playerId: "p1", todayIso: "2027-01-05", mdContext: "MD-3" as MdContext, verdict: "FULL",
  sprintSpeedDropPct: null, sprintExposureBand: null, codAsymmetryPct: null, decelBurdenBand: null, decelBurdenHighStreakDays: 0,
  wellness: { sleepQuality: null, muscleSoreness: null, fatigueEnergy: null, stressMood: null, soreAreas: [] },
  vbtDecrement: null, injuryStatus: "cleared", fosterMonotony: null, fosterStrain: null, isCongestedWeek: false,
  teamPalette: { isometric: ["ex_imtp_iso"], upper_body: ["ex_db_bench_press"], power_explosive: ["ex_trap_bar_jump_squat", "ex_box_jump", "ex_depth_jump"], bilateral_strength: ["ex_trap_bar_dl", "ex_back_squat"], unilateral_strength: ["ex_bulgarian_ss"] },
  seasonPhase: "preseason", ...over,
});
const dose = (s: StrengthSession | null, id: string) => (s?.blocks ?? []).flatMap((b) => b.exercises).find((e) => e.exerciseId === id)?.dose;
const trims = (s: StrengthSession | null) => (s?.appliedAdaptations ?? []).filter((a) => a.ruleId === "DAY_RULE_TRIM").map((a) => a.actionEN);

describe("MD-3 French contrast: the heavy reps and the jump's rounds both stay", () => {
  it("pre-season: 3 × 3 heavy (the week rule's 9) and the loaded jump 3 × 3; no loaded-rep trim", () => {
    const s = buildStrengthSession(snap());
    expect(dose(s, "ex_trap_bar_dl")).toMatchObject({ sets: 3, reps: "3", weekRule: true });
    expect(dose(s, "ex_trap_bar_jump_squat")).toMatchObject({ sets: 3, reps: "3" });
    expect(trims(s).some((t) => /Trap-bar (deadlift|jump squat): \d × 3 →/.test(t))).toBe(false);
  });

  it("in season: 2 × 3 heavy (the week rule's 6) and the loaded jump 2 × 3", () => {
    const s = buildStrengthSession(snap({ seasonPhase: "inseason" }));
    expect(dose(s, "ex_trap_bar_dl")).toMatchObject({ sets: 2, reps: "3" });
    expect(dose(s, "ex_trap_bar_jump_squat")).toMatchObject({ sets: 2, reps: "3" });
  });

  it("the jump counts in the 30 contacts instead; a heavier loaded lift in the block still counts as loaded", () => {
    expect(CONTRAST_JUMP_MAX_PCT).toBe(40);
    const blk = { id: "f", titleEN: "F", titleIS: "F", type: "FRENCH_CONTRAST" as const, exercises: [] };
    const jump = { exerciseId: "ex_trap_bar_jump_squat", nameEN: "J", nameIS: "J", category: "EXPLOSIVE_OLYMPIC" as const, dose: { sets: 3, reps: "3", intensity: "20% 1RM", rest: "1 min" } };
    expect(isContrastJump(blk, jump)).toBe(true);
    expect(isContrastJump(blk, { ...jump, dose: { ...jump.dose, intensity: "60% 1RM" } })).toBe(false);
    expect(isContrastJump({ ...blk, type: "POWER_PRIMER" }, jump)).toBe(false);
  });
});

describe("no cluster on MD-3", () => {
  it("cluster is not offered on MD-3, still on MD-4", () => {
    expect(STRUCTURES_ALLOWED_BY_MD["MD-3"]).not.toContain("cluster");
    expect(STRUCTURES_ALLOWED_BY_MD["MD-4"]).toContain("cluster");
  });

  it("a yellow player on an MD-3 contrast keeps a strength lift (no more step to a cluster the day rule empties)", () => {
    const s = buildStrengthSession(snap({ seasonPhase: "inseason", verdict: "MODIFIED", mdStructures: { "MD-3": "contrast" } as never }));
    const main = (s?.blocks ?? []).flatMap((b) => b.exercises).filter((e) => ["COMPOUND_STRENGTH", "ISOMETRIC_MAX"].includes(e.category));
    expect(main.length).toBeGreaterThan(0);
    expect(trims(s).some((t) => /taken out/.test(t) && /deadlift/i.test(t))).toBe(false);
  });
});
