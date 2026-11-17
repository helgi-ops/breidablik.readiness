/**
 * Player exercise picks (lota 1, 2026-11-17): the limits (team list, max per group, locks), the engine (picks go
 * first in their group; no picks = the coach's list exactly; safety rules still win) and the write boundary (only
 * playerPicksStore writes, never Today's session or the readiness entries).
 */
import { describe, it, expect } from "vitest";
import { buildStrengthSession } from "../index";
import { strengthSessionToTodayStructure } from "../toTodayStructure";
import {
  effectivePool,
  pickableSlots,
  sanitizePicks,
  validatePlayerPick,
  type PlayerExercisePicks,
} from "../playerPicks";
import type { PaletteSlots } from "../palette";
import type { PlayerStrengthSnapshot, MdContext } from "../types";

// Breiðablik's list (2026-11-17), the shape the engine reads.
const PALETTE: PaletteSlots = {
  isometric: ["ex_imtp_iso"],
  upper_body: ["ex_db_bench_press", "ex_bb_bench_press", "ex_bb_bent_row", "ex_db_shoulder_press"],
  power_explosive: ["ex_jump_shrug", "ex_mid_thigh_pull_dynamic", "ex_db_snatch", "ex_box_jump", "ex_depth_jump", "ex_trap_bar_jump_squat"],
  bilateral_strength: ["ex_hip_thrust", "ex_back_squat", "ex_trap_bar_dl"],
  unilateral_strength: ["ex_bulgarian_ss", "ex_single_leg_rdl"],
};

const snap = (over: Partial<PlayerStrengthSnapshot> = {}): PlayerStrengthSnapshot => ({
  playerId: "p1",
  todayIso: "2026-11-17",
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
  teamPalette: PALETTE,
  seasonPhase: "preseason",
  ...over,
});
const ids = (s: ReturnType<typeof buildStrengthSession>) => (s?.blocks ?? []).flatMap((b) => b.exercises.map((e) => e.exerciseId));
const picked = (s: ReturnType<typeof buildStrengthSession>) => (s?.blocks ?? []).flatMap((b) => b.exercises.filter((e) => e.playerPick).map((e) => e.exerciseId));
const rule = (s: ReturnType<typeof buildStrengthSession>, id: string) => (s?.appliedAdaptations ?? []).find((a) => a.ruleId === id);

describe("limits", () => {
  it("only groups with a real choice (≥ 2 on the list); never isometrics", () => {
    expect(pickableSlots(PALETTE)).toEqual(["power_explosive", "bilateral_strength", "unilateral_strength", "upper_body"]);
    expect(pickableSlots({ ...PALETTE, unilateral_strength: ["ex_bulgarian_ss"] })).not.toContain("unilateral_strength");
    expect(pickableSlots({ isometric: ["ex_imtp_iso", "ex_iso_ham_bridge_long"] })).toEqual([]);
  });

  it("rejects an exercise off the list, too many, a locked group, an unknown group", () => {
    expect(validatePlayerPick("bilateral_strength", ["ex_front_squat"], PALETTE, []).ok).toBe(false);
    expect(validatePlayerPick("power_explosive", ["ex_box_jump", "ex_db_snatch", "ex_jump_shrug"], PALETTE, []).ok).toBe(false);
    expect(validatePlayerPick("upper_body", ["ex_db_bench_press", "ex_bb_bent_row"], PALETTE, []).ok).toBe(false);
    expect(validatePlayerPick("bilateral_strength", ["ex_back_squat"], PALETTE, ["bilateral_strength"]).ok).toBe(false);
    expect(validatePlayerPick("isometric", ["ex_imtp_iso"], PALETTE, []).ok).toBe(false);
    expect(validatePlayerPick("nope", [], PALETTE, []).ok).toBe(false);
    expect(validatePlayerPick("bilateral_strength", [1], PALETTE, []).ok).toBe(false);
  });

  it("accepts picks on the list, clears with [], and lets the coach change a locked group", () => {
    expect(validatePlayerPick("power_explosive", ["ex_box_jump", "ex_box_jump", "ex_db_snatch"], PALETTE, [])).toEqual({ ok: true, slot: "power_explosive", ids: ["ex_box_jump", "ex_db_snatch"] });
    expect(validatePlayerPick("bilateral_strength", [], PALETTE, [])).toEqual({ ok: true, slot: "bilateral_strength", ids: [] });
    expect(validatePlayerPick("bilateral_strength", ["ex_back_squat"], PALETTE, ["bilateral_strength"], { coach: true }).ok).toBe(true);
  });

  it("on read, drops picks no longer on the list and caps the group", () => {
    expect(sanitizePicks({ bilateral_strength: ["ex_front_squat", "ex_back_squat"], power_explosive: ["ex_box_jump", "ex_db_snatch", "ex_jump_shrug"], isometric: ["ex_imtp_iso"] }, PALETTE))
      .toEqual({ bilateral_strength: ["ex_back_squat"], power_explosive: ["ex_box_jump", "ex_db_snatch"] });
    expect(sanitizePicks(null, PALETTE)).toEqual({});
  });

  it("the pool: picks first, then the rest of the coach's list in order; no picks = the list", () => {
    expect(effectivePool("bilateral_strength", PALETTE, { bilateral_strength: ["ex_trap_bar_dl"] })).toEqual(["ex_trap_bar_dl", "ex_hip_thrust", "ex_back_squat"]);
    expect(effectivePool("bilateral_strength", PALETTE, undefined)).toEqual(PALETTE.bilateral_strength);
    expect(effectivePool("isometric", PALETTE, { bilateral_strength: ["ex_back_squat"] })).toEqual(PALETTE.isometric);
  });
});

describe("engine", () => {
  const mds: MdContext[] = ["MD-4", "MD-3", "MD-2", "MD-1", "MD+1"];

  it("no picks (or empty picks) = exactly the session without picks, every MD day", () => {
    for (const md of mds) {
      const a = buildStrengthSession(snap({ mdContext: md }));
      const b = buildStrengthSession(snap({ mdContext: md, playerExercisePicks: {} }));
      expect(b).toEqual(a);
      expect(rule(a, "PLAYER_PICK_APPLIED")).toBeUndefined();
    }
  });

  it("a bilateral pick fills the main lift, marked as the player's pick, with the template dose", () => {
    const without = buildStrengthSession(snap());
    const s = buildStrengthSession(snap({ playerExercisePicks: { bilateral_strength: ["ex_back_squat"] } }));
    expect(ids(without)).toContain("ex_hip_thrust");
    expect(ids(s)).toContain("ex_back_squat");
    expect(ids(s)).not.toContain("ex_hip_thrust");
    expect(picked(s)).toEqual(["ex_back_squat"]);
    const dose = (x: typeof s, id: string) => x!.blocks.flatMap((b) => b.exercises).find((e) => e.exerciseId === id)!.dose;
    expect(dose(s, "ex_back_squat")).toEqual(dose(without, "ex_hip_thrust"));
    expect(rule(s, "PLAYER_PICK_APPLIED")?.triggerEN).toContain("Back");
  });

  it("an off-list pick is ignored (the session is the same as with no picks)", () => {
    const s = buildStrengthSession(snap({ playerExercisePicks: { bilateral_strength: ["ex_front_squat"] } as PlayerExercisePicks }));
    expect(s).toEqual(buildStrengthSession(snap()));
  });

  it("the symmetry rule still decides the group: an asymmetric player gets their one-leg pick, not their two-leg one", () => {
    const s = buildStrengthSession(snap({
      codAsymmetryPct: 14,
      playerExercisePicks: { bilateral_strength: ["ex_back_squat"], unilateral_strength: ["ex_single_leg_rdl"] },
    }));
    expect(ids(s)).toContain("ex_single_leg_rdl");
    expect(ids(s)).not.toContain("ex_back_squat");
  });

  it("the upper-body pick is used for the pre-season upper block", () => {
    const s = buildStrengthSession(snap({ playerExercisePicks: { upper_body: ["ex_bb_bent_row"] } }));
    const upper = s!.blocks.find((b) => b.id === "upper-body")!;
    expect(upper.exercises[0].exerciseId).toBe("ex_bb_bent_row");
    expect(upper.exercises[0].playerPick).toBe(true);
  });

  it("Nordic and Copenhagen are never touched by picks", () => {
    const s = buildStrengthSession(snap({ playerExercisePicks: { bilateral_strength: ["ex_trap_bar_dl"], power_explosive: ["ex_depth_jump"] } }));
    expect(ids(s)).toContain("ex_nordic_curl");
    expect(ids(s)).toContain("ex_copenhagen");
  });

  it("standard mode ignores picks (the palette does not build a standard session)", () => {
    const a = buildStrengthSession(snap(), [], { mode: "standard" });
    const b = buildStrengthSession(snap({ playerExercisePicks: { bilateral_strength: ["ex_back_squat"] } }), [], { mode: "standard" });
    expect(b).toEqual(a);
  });

  it("the player's card says \"Your pick\" / \"Þitt val\"", () => {
    const s = buildStrengthSession(snap({ playerExercisePicks: { bilateral_strength: ["ex_back_squat"] } }))!;
    const item = (lang: "EN" | "IS") => strengthSessionToTodayStructure(s, lang).flatMap((b) => b.items).find((i) => i.exerciseId === "ex_back_squat");
    expect(item("EN")?.note).toBe("Your pick");
    expect(item("IS")?.note).toBe("Þitt val");
  });
});

describe("safety rules win over a player's pick", () => {
  it("sore lower back: picked trap-bar deadlift never comes in; front squat stays", () => {
    const s = buildStrengthSession(snap({
      wellness: { sleepQuality: null, muscleSoreness: null, fatigueEnergy: null, stressMood: null, soreAreas: ["lower_back"] },
      playerExercisePicks: { bilateral_strength: ["ex_trap_bar_dl"] },
    }));
    expect(ids(s)).not.toContain("ex_trap_bar_dl");
    expect(ids(s)).toContain("ex_front_squat");
    expect(picked(s)).toEqual([]);
  });

  it("decel streak: picked depth jump is passed over", () => {
    const s = buildStrengthSession(snap({ mdContext: "MD-3", decelBurdenHighStreakDays: 4, playerExercisePicks: { power_explosive: ["ex_depth_jump"] } }));
    expect(ids(s)).not.toContain("ex_depth_jump");
  });

  it("sprint drop: picked dynamic mid-thigh pull is passed over", () => {
    const s = buildStrengthSession(snap({ sprintSpeedDropPct: 9, playerExercisePicks: { power_explosive: ["ex_mid_thigh_pull_dynamic"] } }));
    expect(ids(s)).not.toContain("ex_mid_thigh_pull_dynamic");
  });

  it("sore hamstrings: picked single-leg RDL is passed over, the hamstring bridge stays", () => {
    const s = buildStrengthSession(snap({
      codAsymmetryPct: 14,
      wellness: { sleepQuality: null, muscleSoreness: null, fatigueEnergy: null, stressMood: null, soreAreas: ["hamstring"] },
      playerExercisePicks: { unilateral_strength: ["ex_single_leg_rdl"] },
    }));
    expect(ids(s)).not.toContain("ex_single_leg_rdl");
    expect(ids(s)).toContain("ex_iso_ham_bridge_long");
  });
});

describe("write boundary", () => {
  const codeOf = async (path: string) => {
    const { readFileSync } = await import("node:fs");
    return readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  };
  it("only playerPicksStore writes, and only the picks tables; the team list and send mode are only read; never Today or readiness", async () => {
    const { resolve } = await import("node:path");
    const store = await codeOf(resolve(process.cwd(), "src/lib/micropulse/strengthProgramming/playerPicksStore.ts"));
    expect(store).not.toMatch(/player_today_strength_override|readiness_entries/);
    const tables = [...store.matchAll(/\.from\("([a-z_]+)"\)/g)].map((m) => m[1]);
    for (const t of tables) expect(["player_strength_picks", "player_strength_pick_events", "team_strength_palette", "teams"]).toContain(t);
    // Three send modes (2026-11-17): the team's mode is the switch; the store only READS teams and the palette.
    for (const t of ["teams", "team_strength_palette"]) {
      for (const m of store.matchAll(new RegExp(`\\.from\\("${t}"\\)([^;]*)`, "g"))) expect(m[1]).not.toMatch(/\.(update|insert|upsert|delete)\(/);
    }
    expect(store).not.toMatch(/player_picks_enabled:/);
    for (const r of [
      "src/lib/micropulse/strengthProgramming/playerPicks.ts",
      "src/app/api/player/strength-picks/route.ts",
      "src/app/api/coach/team/player-strength-picks/route.ts",
    ]) {
      expect(await codeOf(resolve(process.cwd(), r))).not.toMatch(/player_today_strength_override|readiness_entries|\.insert\(|\.upsert\(|\.update\(|\.delete\(/);
    }
  });
});
