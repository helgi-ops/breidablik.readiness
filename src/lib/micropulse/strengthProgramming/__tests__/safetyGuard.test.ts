/**
 * Safety guard (2026-11-17): the team palette (and, later, a player's own picks) can never undo
 * what a safety rule did — a swap-in stays, a removed exercise never comes back, and a candidate
 * that today's state contraindicates is passed over. Without a safety condition the palette
 * behaves exactly as before.
 */
import { describe, it, expect } from "vitest";
import { buildStrengthSession, applyAdaptationRules, newAdaptationTrace } from "../index";
import { strengthSessionToTodayStructure } from "../toTodayStructure";
import type { PlayerStrengthSnapshot, MdContext, SessionBlock } from "../types";

const snap = (over: Partial<PlayerStrengthSnapshot> = {}): PlayerStrengthSnapshot => ({
  playerId: "p1",
  todayIso: "2026-09-08",
  mdContext: "MD-4" as MdContext,
  verdict: "FULL",
  sprintSpeedDropPct: null,
  sprintExposureBand: null,
  codAsymmetryPct: null,
  decelBurdenBand: null,
  decelBurdenHighStreakDays: 0,
  wellness: { sleepQuality: null, muscleSoreness: null, fatigueEnergy: null, stressMood: null, soreAreas: [] },
  vbtDecrement: null,
  injuryStatus: "cleared",
  fosterMonotony: null,
  fosterStrain: null,
  isCongestedWeek: false,
  ...over,
});
const sore = (...areas: string[]) => ({ sleepQuality: null, muscleSoreness: null, fatigueEnergy: null, stressMood: null, soreAreas: areas });
const ids = (s: ReturnType<typeof buildStrengthSession>) => (s?.blocks ?? []).flatMap((b) => b.exercises.map((e) => e.exerciseId));
const rule = (s: ReturnType<typeof buildStrengthSession>, id: string) => (s?.appliedAdaptations ?? []).find((a) => a.ruleId === id);

describe("trace from applyAdaptationRules", () => {
  it("records nothing when no safety condition fires", () => {
    const t = newAdaptationTrace();
    const blocks: SessionBlock[] = [];
    applyAdaptationRules(blocks, snap(), t);
    expect([...t.pinned, ...t.banned, ...t.contras]).toEqual([]);
  });

  it("is optional — same audit with and without it", () => {
    const mk = () => buildStrengthSession(snap({ wellness: sore("lower_back") }))!.blocks;
    const a = applyAdaptationRules(structuredClone(mk()), snap({ wellness: sore("lower_back") }));
    const b = applyAdaptationRules(structuredClone(mk()), snap({ wellness: sore("lower_back") }), newAdaptationTrace());
    expect(b).toEqual(a);
  });
});

describe("palette never undoes a safety rule", () => {
  it("sore lower back: front squat (the safety swap) stays; the trap-bar deadlift pick never comes back", () => {
    const s = buildStrengthSession(snap({
      wellness: sore("lower_back"),
      teamPalette: { bilateral_strength: ["ex_trap_bar_dl", "ex_back_squat"] },
    }));
    expect(ids(s)).toContain("ex_front_squat");
    expect(ids(s)).not.toContain("ex_trap_bar_dl");
    expect(s?.blockedExerciseIds).toContain("ex_trap_bar_dl");
    expect(s?.blockedExerciseIds).toContain("ex_deadlift");
  });

  it("decel streak: depth jump is passed over in the power pool, the next pick is used", () => {
    const s = buildStrengthSession(snap({
      mdContext: "MD-3",
      decelBurdenHighStreakDays: 3,
      teamPalette: { power_explosive: ["ex_depth_jump", "ex_box_jump", "ex_trap_bar_jump_squat"] },
    }));
    expect(ids(s)).not.toContain("ex_depth_jump");
    expect(ids(s)).not.toContain("ex_nordic_curl");
    expect(ids(s)).toContain("ex_box_jump");
  });

  it("sore hamstrings: a hamstring-contraindicated unilateral pick is skipped for the next one", () => {
    const s = buildStrengthSession(snap({
      wellness: sore("hamstring"),
      codAsymmetryPct: 12,
      teamPalette: { unilateral_strength: ["ex_single_leg_rdl", "ex_bulgarian_ss"] },
    }));
    expect(ids(s)).not.toContain("ex_single_leg_rdl");
    expect(ids(s)).toContain("ex_bulgarian_ss");
    // Nordic → long iso bridge (Rule 2) stands.
    expect(ids(s)).toContain("ex_iso_ham_bridge_long");
    expect(ids(s)).not.toContain("ex_nordic_curl");
  });

  it("a pool with only ruled-out picks leaves the rule's exercise in place", () => {
    const s = buildStrengthSession(snap({
      wellness: sore("lower_back"),
      teamPalette: { bilateral_strength: ["ex_trap_bar_dl", "ex_deadlift"] },
    }));
    expect(ids(s)).toContain("ex_front_squat");
    expect(rule(s, "TEAM_PALETTE_APPLIED")).toBeUndefined();
  });

  it("a ledger-added exercise is not replaced by the palette", () => {
    const s = buildStrengthSession(snap({
      mdContext: "MD-4",
      ledgerEmphases: ["plyometric"],
      teamPalette: { power_explosive: ["ex_box_jump"] },
    }));
    expect(ids(s)).toContain("ex_lateral_bound");
  });
});

describe("no safety condition → palette behaves as before", () => {
  it("first bilateral pick fills the compound slot; audit counts one slot", () => {
    const s = buildStrengthSession(snap({ teamPalette: { bilateral_strength: ["ex_back_squat", "ex_front_squat"] } }));
    expect(ids(s)).toContain("ex_back_squat");
    expect(rule(s, "TEAM_PALETTE_APPLIED")?.triggerEN).toBe("Team exercise palette (1 slot filled from the coach's pool)");
    expect(s?.blockedExerciseIds).toBeUndefined();
  });

  it("MD-3 french contrast takes the power picks in list order", () => {
    const s = buildStrengthSession(snap({
      mdContext: "MD-3",
      teamPalette: { power_explosive: ["ex_depth_jump", "ex_box_jump"] },
    }));
    // No decel streak → depth jump is allowed and comes first.
    expect(ids(s)).toContain("ex_depth_jump");
  });
});

describe("swap options on the player's card", () => {
  it("never offer an exercise today's safety rules rule out", () => {
    const s = buildStrengthSession(snap({ wellness: sore("lower_back") }))!;
    const structure = strengthSessionToTodayStructure(s, "EN");
    const offered = structure.flatMap((b) => b.items.flatMap((i) => (i.alternatives ?? []).map((a) => a.id)));
    for (const id of s.blockedExerciseIds ?? []) expect(offered).not.toContain(id);
  });
});
