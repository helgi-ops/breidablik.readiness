/**
 * Contradiction 3 (2026-11-23): the deficit ledger's max-strength emphasis never adds a heavy lift on top of the week
 * rule's heavy reps, nor back after a safety rule changed the main lift.
 */
import { describe, expect, it } from "vitest";
import { applyAdaptationRules, newAdaptationTrace } from "../adaptationRules";
import { buildStrengthSession } from "..";
import type { MdContext, PlayerStrengthSnapshot, SessionBlock } from "../types";

const snap = (over: Partial<PlayerStrengthSnapshot> = {}): PlayerStrengthSnapshot => ({
  playerId: "p1", todayIso: "2026-11-17", mdContext: "MD-4" as MdContext, verdict: "FULL",
  sprintSpeedDropPct: null, sprintExposureBand: null, codAsymmetryPct: null, decelBurdenBand: null, decelBurdenHighStreakDays: 0,
  wellness: { sleepQuality: null, muscleSoreness: null, fatigueEnergy: null, stressMood: null, soreAreas: [] },
  vbtDecrement: null, injuryStatus: "cleared", fosterMonotony: null, fosterStrain: null, isCongestedWeek: false,
  seasonPhase: "inseason", ...over,
});
const noCompound = (): SessionBlock[] => [{ id: "u", titleEN: "U", titleIS: "U", type: "UNILATERAL", exercises: [
  { exerciseId: "ex_bulgarian_ss", nameEN: "Bulgarian split squat", nameIS: "Búlgörsk", category: "UNILATERAL_STRENGTH", dose: { sets: 3, reps: "5 each leg", intensity: "RPE 8", rest: "2 min" } },
] }];
const ids = (b: SessionBlock[]) => b.flatMap((x) => x.exercises.map((e) => e.exerciseId));

describe("ledger max strength vs the week rule", () => {
  it("week rule set today's heavy reps: no back squat added; a confirm line names the week rule", () => {
    const blocks = noCompound();
    const audit = applyAdaptationRules(blocks, snap({ ledgerEmphases: ["max_strength"] }), newAdaptationTrace(), 9);
    expect(ids(blocks)).not.toContain("ex_back_squat");
    const line = audit.find((a) => a.ruleId === "LEDGER_EMPHASIS_CONFIRM")!;
    expect(line.actionEN).toBe("Today's heavy reps come from the week rule (9); no heavy lift added on top");
    expect(line.actionIS).toMatch(/koma úr vikureglunni \(9\)/);
    expect(audit.some((a) => a.ruleId === "LEDGER_EMPHASIS_ADD")).toBe(false);
  });

  it("no week rule (standard mode, basketball, no weekday plan): the old add stays", () => {
    const blocks = noCompound();
    const audit = applyAdaptationRules(blocks, snap({ ledgerEmphases: ["max_strength"] }), newAdaptationTrace(), null);
    expect(ids(blocks)).toContain("ex_back_squat");
    expect(audit.some((a) => a.ruleId === "LEDGER_EMPHASIS_ADD")).toBe(true);
  });

  it("other emphases are unchanged by the week rule (unilateral still added when missing)", () => {
    const blocks: SessionBlock[] = [{ id: "c", titleEN: "C", titleIS: "C", type: "COMPOUND", exercises: [
      { exerciseId: "ex_trap_bar_dl", nameEN: "Trap bar", nameIS: "Trap bar", category: "COMPOUND_STRENGTH", dose: { sets: 3, reps: "3", intensity: "85%", rest: "3 min", weekRule: true } },
    ] }];
    applyAdaptationRules(blocks, snap({ ledgerEmphases: ["unilateral"] }), newAdaptationTrace(), 9);
    expect(ids(blocks)).toContain("ex_bulgarian_ss");
  });

  it("full build, in-season MD-4: the heavy reps stay the week rule's", () => {
    const heavyReps = (s: ReturnType<typeof buildStrengthSession>) => (s?.blocks ?? []).flatMap((b) => b.exercises)
      .filter((e) => e.category === "COMPOUND_STRENGTH" && !e.dose.nearMatch)
      .reduce((n, e) => n + e.dose.sets * (parseInt(e.dose.reps, 10) || 0), 0);
    const plain = buildStrengthSession(snap());
    const withLedger = buildStrengthSession(snap({ ledgerEmphases: ["max_strength"] }));
    expect(heavyReps(withLedger)).toBe(heavyReps(plain));
  });
});
