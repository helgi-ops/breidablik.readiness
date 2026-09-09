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

const CORR = [{
  slug: "clamshell", nameEN: "Clamshell (banded)", nameIS: "Skel",
  doseEN: "2–3 × 12–15 / side", doseIS: "2–3 × 12–15 / hlið",
  cueEN: "Heels together.", cueIS: "Hælar saman.",
  sourceNoteEN: "Movement screen · re-screen in ~5 wks", sourceNoteIS: "Hreyfiskimun",
}];

describe("corrective ↔ strength merge (one session, no override collision)", () => {
  it("merges the screen correctives onto a strength-day session (one session carries both)", () => {
    const s = buildStrengthSession(snap({ correctives: CORR }))!;
    expect(s.correctives).toHaveLength(1);
    expect(s.blocks.length).toBeGreaterThan(0); // strength blocks too — ONE session
    expect(s.appliedAdaptations.some((a) => a.ruleId === "CORRECTIVE_MERGED")).toBe(true);
  });

  it("records CONFIRM (corroboration) when a corrective covers a ledger emphasis, not a double-count", () => {
    const s = buildStrengthSession(snap({ correctives: CORR, correctiveEmphases: ["unilateral"], ledgerEmphases: ["unilateral"] }))!;
    expect(s.appliedAdaptations.some((a) => a.ruleId === "CORRECTIVE_CORROBORATES_EMPHASIS")).toBe(true);
    expect(s.correctives).toHaveLength(1); // kept, not dropped
  });

  it("injured → no strength session and no correctives merged (physio rehab only)", () => {
    const s = buildStrengthSession(snap({ injuryStatus: "injured", correctives: CORR }))!;
    expect(s.blocks).toHaveLength(0);
    expect(s.correctives).toBeUndefined();
  });

  it("non-strength day (match day) → null (the send route handles a corrective-only fallback)", () => {
    const s = buildStrengthSession(snap({ mdContext: "MD" as MdContext, correctives: CORR }));
    expect(s).toBeNull();
  });
});

describe("send mode — standard vs individualised (coach choice)", () => {
  it("standard mode: MD template kept, but ledger emphases + correctives skipped", () => {
    const s = buildStrengthSession(snap({ ledgerEmphases: ["unilateral"], correctives: CORR }), [], { mode: "standard" })!;
    expect(s.blocks.length).toBeGreaterThan(0); // still a real readiness/MD session
    expect(s.correctives).toBeUndefined(); // no screen corrective merged
    expect(s.appliedAdaptations.some((a) => a.ruleId.startsWith("LEDGER_EMPHASIS"))).toBe(false);
    expect(s.appliedAdaptations.some((a) => a.ruleId === "STANDARD_MODE")).toBe(true);
  });

  it("individualised mode (default): ledger emphases + correctives applied", () => {
    const s = buildStrengthSession(snap({ ledgerEmphases: ["unilateral"], correctives: CORR }))!;
    expect(s.correctives).toHaveLength(1);
    expect(ledgerAudit(s).length).toBeGreaterThan(0);
    expect(s.appliedAdaptations.some((a) => a.ruleId === "STANDARD_MODE")).toBe(false);
  });

  it("standard mode still applies readiness (REDUCED verdict deloads)", () => {
    const s = buildStrengthSession(snap({ verdict: "REDUCED" }), [], { mode: "standard" })!;
    expect(s.appliedAdaptations.some((a) => /REDUCED/i.test(a.triggerEN))).toBe(true);
  });
});
