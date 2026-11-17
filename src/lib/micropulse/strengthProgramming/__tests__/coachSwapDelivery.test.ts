/**
 * The coach's daily swaps reach the player (fix 2026-11-17). Before: a swap made on the strength card showed in the
 * coach's preview but every send (one player, team, 09:00 auto-send) built the session with no swaps, so the player
 * got the engine's exercise. Now the sends load the day's swaps, and a swap applies only while the exercise it
 * replaced is still in that slot (a swap made on another MD-day preview never replaces a different exercise).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildStrengthSession, type CoachOverride } from "../index";
import type { PaletteSlots } from "../palette";
import type { MdContext, PlayerStrengthSnapshot } from "../types";

const PALETTE: PaletteSlots = {
  isometric: ["ex_imtp_iso"],
  upper_body: ["ex_db_bench_press", "ex_bb_bench_press", "ex_bb_bent_row", "ex_db_shoulder_press"],
  power_explosive: ["ex_jump_shrug", "ex_mid_thigh_pull_dynamic", "ex_db_snatch", "ex_box_jump", "ex_depth_jump", "ex_trap_bar_jump_squat"],
  bilateral_strength: ["ex_hip_thrust", "ex_back_squat", "ex_trap_bar_dl"],
  unilateral_strength: ["ex_bulgarian_ss", "ex_single_leg_rdl"],
};

const snap = (md: MdContext = "MD-4"): PlayerStrengthSnapshot => ({
  playerId: "p1",
  todayIso: "2026-11-17",
  mdContext: md,
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
  teamPalette: PALETTE,
  seasonPhase: "in_season",
});

type S = ReturnType<typeof buildStrengthSession>;
const at = (s: S, blockId: string, pos: number) => s!.blocks.find((b) => b.id === blockId)!.exercises[pos];

/** The first main-lift slot of the session (hip thrust from the palette) and a library lift to swap it for. */
function firstSlot(md: MdContext = "MD-4") {
  const s = buildStrengthSession(snap(md))!;
  const block = s.blocks.find((b) => b.exercises[0]?.exerciseId === "ex_hip_thrust")
    ?? s.blocks.find((b) => b.exercises.some((e) => e.exerciseId === "ex_hip_thrust"))!;
  const position = block.exercises.findIndex((e) => e.exerciseId === "ex_hip_thrust");
  return { s, blockId: block.id, position, original: "ex_hip_thrust", replacement: "ex_front_squat" };
}

describe("coach swap", () => {
  it("applies while the swapped-out exercise is still in the slot", () => {
    const { blockId, position, original, replacement } = firstSlot();
    const ov: CoachOverride = { blockId, position, overrideExerciseId: replacement, originalExerciseId: original };
    const s = buildStrengthSession(snap(), [ov]);
    expect(at(s, blockId, position).exerciseId).toBe(replacement);
    expect(at(s, blockId, position).modificationReason).toMatch(/Coach/);
  });

  it("never replaces a different exercise (swap made for another exercise / another MD preview)", () => {
    const { s: base, blockId, position, replacement } = firstSlot();
    const ov: CoachOverride = { blockId, position, overrideExerciseId: replacement, originalExerciseId: "ex_back_squat" };
    const s = buildStrengthSession(snap(), [ov]);
    expect(at(s, blockId, position).exerciseId).toBe("ex_hip_thrust");
    expect(s!.blocks).toEqual(base.blocks);
  });

  it("an old swap with no recorded original still applies (as before)", () => {
    const { blockId, position, replacement } = firstSlot();
    const s = buildStrengthSession(snap(), [{ blockId, position, overrideExerciseId: replacement }]);
    expect(at(s, blockId, position).exerciseId).toBe(replacement);
  });

  it("no swaps = the session exactly as before", () => {
    expect(buildStrengthSession(snap(), [])).toEqual(buildStrengthSession(snap()));
  });
});

describe("every send carries the day's swaps", () => {
  const root = join(__dirname, "..", "..", "..", "..", "..");
  const read = (p: string) => readFileSync(join(root, p), "utf8");

  it("one player: loads today's swaps (individualised, like the card) and builds with them", () => {
    const src = read("src/app/api/coach/player/[id]/send-strength-session/route.ts");
    expect(src).toMatch(/loadCoachOverrides\(supabase, \{ playerId, dateIso: todayIso \}\)/);
    expect(src).toMatch(/buildStrengthSession\(withGoalSeason\(snapshot, coachBlock\), coachOverrides, \{ mode \}\)/);
  });

  it("team send and the 09:00 auto-send: one read for the squad, each player built with their swaps", () => {
    for (const p of ["src/app/api/coach/team/send-strength-sessions/route.ts", "src/app/api/strength/auto-send/route.ts"]) {
      const src = read(p);
      expect(src).toMatch(/loadCoachOverridesForPlayers\(/);
      expect(src).toMatch(/buildStrengthSession\(withGoalSeason\(snapshot, coachBlock\), swapsByPlayer\.get\(p\.id\) \?\? \[\], \{ mode \}\)/);
      expect(src).not.toMatch(/buildStrengthSession\(snapshot, \[\], \{ mode \}\)/);
    }
  });
});
