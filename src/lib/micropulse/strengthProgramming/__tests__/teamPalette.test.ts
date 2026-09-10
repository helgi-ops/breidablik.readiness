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

  it("ASYMMETRIC + only a bilateral pick → never falls back to bilateral (keeps the adaptation's unilateral lift)", () => {
    // The one-directional guard: an asymmetric player must not be pulled back to a
    // bilateral lift even if that's the only palette pool — the adaptation engine
    // already swapped the main lift to unilateral.
    const s = buildStrengthSession(
      snap({ codAsymmetryPct: 20, teamPalette: { bilateral_strength: ["ex_front_squat"] } }),
    );
    expect(allEx(s)).not.toContain("ex_front_squat");
  });

  it("the injury-prevention posterior block (Nordic) is never palette-substituted", () => {
    const s = buildStrengthSession(
      snap({ teamPalette: { bilateral_strength: ["ex_front_squat"] } }),
    );
    // Nordic curl survives regardless of the palette.
    expect(allEx(s)).toContain("ex_nordic_curl");
  });

  it("VALD asymmetry alone (no IMA CoD) drives the unilateral pick", () => {
    const s = buildStrengthSession(
      snap({
        codAsymmetryPct: null, // no IMA
        valdAsymmetryPct: 18,  // VALD NordBord/ForceFrame ≥ 10%
        teamPalette: { bilateral_strength: ["ex_front_squat"], unilateral_strength: ["ex_single_leg_rdl"] },
      }),
    );
    expect(allEx(s)).toContain("ex_single_leg_rdl");
    expect(allEx(s)).not.toContain("ex_front_squat");
    expect(audit(s, "PALETTE_SYMMETRY_UNILATERAL")).toBe(true);
  });

  it("the more severe of IMA vs VALD wins; both below threshold → bilateral", () => {
    const uni = buildStrengthSession(
      snap({ codAsymmetryPct: 4, valdAsymmetryPct: 25, teamPalette: { bilateral_strength: ["ex_front_squat"], unilateral_strength: ["ex_single_leg_rdl"] } }),
    );
    expect(allEx(uni)).toContain("ex_single_leg_rdl"); // VALD 25% drives it
    const bi = buildStrengthSession(
      snap({ codAsymmetryPct: 4, valdAsymmetryPct: 6, teamPalette: { bilateral_strength: ["ex_front_squat"], unilateral_strength: ["ex_single_leg_rdl"] } }),
    );
    expect(allEx(bi)).toContain("ex_front_squat"); // both < 10% → symmetric
    expect(allEx(bi)).not.toContain("ex_single_leg_rdl");
  });

  it("Lite team (no IMA, no VALD) + unilateral-only palette → honours unilateral", () => {
    const s = buildStrengthSession(
      snap({ codAsymmetryPct: null, valdAsymmetryPct: null, teamPalette: { unilateral_strength: ["ex_single_leg_rdl"] } }),
    );
    expect(allEx(s)).toContain("ex_single_leg_rdl");
    // No symmetry data, so it is NOT flagged as an asymmetry-driven swap.
    expect(audit(s, "PALETTE_SYMMETRY_UNILATERAL")).toBe(false);
  });

  it("Lite team (no data) + both pools → defaults to bilateral (safe)", () => {
    const s = buildStrengthSession(
      snap({ codAsymmetryPct: null, valdAsymmetryPct: null, teamPalette: { bilateral_strength: ["ex_front_squat"], unilateral_strength: ["ex_single_leg_rdl"] } }),
    );
    expect(allEx(s)).toContain("ex_front_squat");
    expect(allEx(s)).not.toContain("ex_single_leg_rdl");
  });

  it("basketball → upper body is a PRIMARY block, before injury-prevention", () => {
    const s = buildStrengthSession(snap({ mdContext: "MD-4" as MdContext, sport: "basketball", teamPalette: { upper_body: ["ex_db_bench_press", "ex_chin_up"] } }))!;
    expect(allEx(s)).toContain("ex_db_bench_press");
    expect(audit(s, "UPPER_BODY_ADDED")).toBe(true);
    const titles = s.blocks.map((b) => b.titleEN);
    const upperIdx = titles.findIndex((t) => /upper body \(primary\)/i.test(t));
    const nordicIdx = titles.findIndex((t) => /nordic/i.test(t));
    expect(upperIdx).toBeGreaterThanOrEqual(0);
    expect(nordicIdx).toBeGreaterThanOrEqual(0);
    expect(upperIdx).toBeLessThan(nordicIdx); // primary → before prevention
  });

  it("football PRE-SEASON → upper body accessory at the end", () => {
    const s = buildStrengthSession(snap({ mdContext: "MD-4" as MdContext, sport: "football", seasonPhase: "preseason", teamPalette: { upper_body: ["ex_db_bench_press"] } }))!;
    expect(allEx(s)).toContain("ex_db_bench_press");
    const titles = s.blocks.map((b) => b.titleEN);
    expect(/upper body \(accessory\)/i.test(titles[titles.length - 1])).toBe(true); // last block
  });

  it("football IN-SEASON → light maintenance upper block (1 lift, ≤2 sets, at the end)", () => {
    const s = buildStrengthSession(snap({ mdContext: "MD-4" as MdContext, sport: "football", seasonPhase: "inseason", teamPalette: { upper_body: ["ex_db_bench_press", "ex_chin_up"] } }))!;
    expect(audit(s, "UPPER_BODY_ADDED")).toBe(true);
    const upper = s.blocks.find((b) => /upper body \(maintenance\)/i.test(b.titleEN));
    expect(upper).toBeTruthy();
    expect(upper!.exercises).toHaveLength(1); // only one lift in-season
    expect(upper!.exercises[0].dose.sets).toBeLessThanOrEqual(2); // low volume
    expect(/upper body \(maintenance\)/i.test(s.blocks[s.blocks.length - 1].titleEN)).toBe(true); // last
  });

  it("empty upper palette → no upper block even for basketball", () => {
    const s = buildStrengthSession(snap({ mdContext: "MD-4" as MdContext, sport: "basketball", teamPalette: { power_explosive: ["ex_box_jump"] } }));
    expect(audit(s, "UPPER_BODY_ADDED")).toBe(false);
  });

  it("taper day (MD-2) → no upper block (strength days only)", () => {
    const s = buildStrengthSession(snap({ mdContext: "MD-2" as MdContext, sport: "basketball", teamPalette: { upper_body: ["ex_db_bench_press"] } }));
    expect(allEx(s)).not.toContain("ex_db_bench_press");
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
