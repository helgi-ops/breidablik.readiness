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

const allEx = (s: ReturnType<typeof buildStrengthSession>) =>
  (s?.blocks ?? []).flatMap((b) => b.exercises.map((e) => e.exerciseId));
const audit = (s: ReturnType<typeof buildStrengthSession>, id: string) =>
  (s?.appliedAdaptations ?? []).some((a) => a.ruleId === id);

describe("team strength palette → buildStrengthSession", () => {
  it("no palette → template exercises are used unchanged (no palette audit)", () => {
    const s = buildStrengthSession(snap());
    expect(audit(s, "TEAM_PALETTE_APPLIED")).toBe(false);
    expect(audit(s, "PALETTE_SYMMETRY_UNILATERAL")).toBe(false);
  });

  it("a bilateral pick fills the compound slot for a SYMMETRIC player", () => {
    const s = buildStrengthSession(
      snap({
        codAsymmetryPct: 2, // symmetric
        teamPalette: { bilateral_strength: ["ex_front_squat"], unilateral_strength: ["ex_bulgarian_ss"] },
      }),
    );
    expect(allEx(s)).toContain("ex_front_squat");
    expect(allEx(s)).not.toContain("ex_bulgarian_ss");
    expect(audit(s, "TEAM_PALETTE_APPLIED")).toBe(true);
    expect(audit(s, "PALETTE_SYMMETRY_UNILATERAL")).toBe(false);
  });

  it("an ASYMMETRIC player gets the coach's unilateral pick in the lower-body slot", () => {
    const s = buildStrengthSession(
      snap({
        codAsymmetryPct: 15, // ≥ 10% → prefer unilateral
        teamPalette: { bilateral_strength: ["ex_front_squat"], unilateral_strength: ["ex_single_leg_rdl"] },
      }),
    );
    expect(allEx(s)).toContain("ex_single_leg_rdl");
    expect(allEx(s)).not.toContain("ex_front_squat");
    expect(audit(s, "PALETTE_SYMMETRY_UNILATERAL")).toBe(true);
  });

  it("symmetric player + only a unilateral pick → keeps the bilateral template (no cross-pool fallback)", () => {
    const s = buildStrengthSession(
      snap({ codAsymmetryPct: 2, teamPalette: { unilateral_strength: ["ex_single_leg_rdl"] } }),
    );
    // Symmetric → the bilateral slot must not be filled from the unilateral pool.
    expect(allEx(s)).not.toContain("ex_single_leg_rdl");
    expect(audit(s, "PALETTE_SYMMETRY_UNILATERAL")).toBe(false);
  });

  it("the injury-prevention posterior block (Nordic) is never palette-substituted", () => {
    const s = buildStrengthSession(
      snap({ teamPalette: { bilateral_strength: ["ex_front_squat"] } }),
    );
    // Nordic curl survives regardless of the palette.
    expect(allEx(s)).toContain("ex_nordic_curl");
  });

  it("standard mode ignores the palette entirely", () => {
    const s = buildStrengthSession(
      snap({ teamPalette: { bilateral_strength: ["ex_front_squat"] } }),
      [],
      { mode: "standard" },
    );
    expect(audit(s, "TEAM_PALETTE_APPLIED")).toBe(false);
  });

  it("a power pick fills the MD-3 power slot", () => {
    const s = buildStrengthSession(
      snap({ mdContext: "MD-3" as MdContext, teamPalette: { power_explosive: ["ex_box_jump"] } }),
    );
    expect(allEx(s)).toContain("ex_box_jump");
    expect(audit(s, "TEAM_PALETTE_APPLIED")).toBe(true);
  });
});
