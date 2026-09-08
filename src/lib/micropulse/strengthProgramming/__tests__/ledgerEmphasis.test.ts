import { describe, it, expect } from "vitest";
import { buildStrengthSession } from "../index";
import type { PlayerStrengthSnapshot, MdContext } from "../types";

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

const ledgerAudit = (s: ReturnType<typeof buildStrengthSession>) =>
  (s?.appliedAdaptations ?? []).filter((a) => a.ruleId.startsWith("LEDGER_EMPHASIS"));

describe("deficit-ledger strength emphasis → buildStrengthSession", () => {
  it("no ledger emphases → session is unchanged (no ledger audit)", () => {
    const s = buildStrengthSession(snap());
    expect(ledgerAudit(s)).toHaveLength(0);
  });

  it("a plyometric emphasis fires a ledger adaptation on a strength day", () => {
    const s = buildStrengthSession(snap({ ledgerEmphases: ["plyometric"] }));
    const fired = ledgerAudit(s);
    expect(fired.length).toBeGreaterThan(0);
    expect(fired[0].evidence).toMatch(/deficit ledger/i);
  });

  it("a unilateral emphasis adds/keeps unilateral work, traceable to the ledger", () => {
    const s = buildStrengthSession(snap({ ledgerEmphases: ["unilateral"] }))!;
    expect(ledgerAudit(s).length).toBeGreaterThan(0);
    const hasUnilateral = s.blocks.some((b) => b.exercises.some((e) => e.category === "UNILATERAL_STRENGTH"));
    expect(hasUnilateral).toBe(true);
  });

  it("eccentric emphasis is suppressed on a high decel-burden streak (acute deload wins)", () => {
    const s = buildStrengthSession(snap({ ledgerEmphases: ["eccentric"], decelBurdenBand: "high", decelBurdenHighStreakDays: 4 }));
    expect(ledgerAudit(s).some((a) => /eccentric/i.test(a.actionEN + a.triggerEN))).toBe(false);
  });

  it("emphasis is gated to the right MD-day (plyometric not forced onto MD+1 recovery)", () => {
    const s = buildStrengthSession(snap({ mdContext: "MD+1" as MdContext, ledgerEmphases: ["plyometric"] }));
    // MD+1 is recovery — plyometric emphasis must not fire here.
    expect(ledgerAudit(s).some((a) => /plyometric|reactive/i.test(a.actionEN))).toBe(false);
  });
});
