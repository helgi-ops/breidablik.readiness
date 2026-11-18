/**
 * Player strength goal (lota 2, 2026-11-17; goals step 3 on 2026-11-18 retired "stronger" / "power" — the engine
 * tests below still use them to pin the step's rules, but only "robust" can reach the engine now): the limits (goal values, coach lock), the engine (+1 set of the
 * matching exercise on the goal's days; no goal = the session exactly as before; never on a lighter / recovery day,
 * in a two-match week, on a braking streak, or on a safety swap) and the deficit-ledger safety fix (an emphasis never
 * adds back what a safety rule took out, nor anything on a recovery day).
 *
 * Season (2026-11-17): the extra set only in pre-season / off-season (the season plan first, then the week setup;
 * unknown → maintenance), not in a light or taper block; with no match near, every strength session in pre-/off-season
 * is a goal day; never more than +1 set (no stacking with the Accumulation +1 or a deficit-ledger addition).
 * The engine tests below run in an off-season Accumulation block unless they say otherwise.
 */
import { describe, it, expect } from "vitest";
import { buildStrengthSession } from "../index";
import { strengthSessionToTodayStructure } from "../toTodayStructure";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GOAL_DAYS, activeGoal, retiredGoalNote, sanitizeGoal, validateGoal, type StrengthGoal } from "../playerPicks";
import { applyBlockToSession } from "../blockEmphasis";
import { goalSeasonOf, withGoalSeason } from "../playerGoal";
import type { PaletteSlots } from "../palette";
import type { PlayerStrengthSnapshot, MdContext } from "../types";

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
  seasonPhase: "in_season",
  goalSeason: { phase: "offseason", blockGoal: "accum" },
  ...over,
});
type S = ReturnType<typeof buildStrengthSession>;
const all = (s: S) => (s?.blocks ?? []).flatMap((b) => b.exercises);
const ids = (s: S) => all(s).map((e) => e.exerciseId);
const goalEx = (s: S) => all(s).filter((e) => e.playerGoal);
const sets = (s: S, id: string) => all(s).find((e) => e.exerciseId === id)?.dose.sets;
const rule = (s: S, id: string) => (s?.appliedAdaptations ?? []).find((a) => a.ruleId === id);
const sore = (...areas: string[]) => ({ sleepQuality: null, muscleSoreness: null, fatigueEnergy: null, stressMood: null, soreAreas: areas });

describe("limits", () => {
  it("only Stronger hamstrings can be chosen (goals step 3, 2026-11-18); null clears; anything else is unknown", () => {
    expect(validateGoal("robust", false)).toEqual({ ok: true, goal: "robust" });
    expect(validateGoal(null, false)).toEqual({ ok: true, goal: null });
    expect(validateGoal("hypertrophy", false).ok).toBe(false);
    expect(sanitizeGoal("muscle")).toBeNull();
    expect(sanitizeGoal("robust")).toBe("robust");
  });

  it("Stronger legs / More explosive are retired: neither the player nor the coach can set them", () => {
    for (const g of ["stronger", "power"]) {
      for (const coach of [false, true]) {
        const v = validateGoal(g, false, { coach });
        expect(v.ok).toBe(false);
        if (!v.ok) expect(v.error.code).toBe("retired");
      }
    }
  });

  it("a player can't change a goal the coach locked; the coach can", () => {
    const p = validateGoal("robust", true);
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.error.code).toBe("locked");
    expect(validateGoal("robust", true, { coach: true }).ok).toBe(true);
  });
});

describe("retired goals stay stored but add nothing (goals step 3, 2026-11-18)", () => {
  it("the engine input keeps only an active goal; a stored retired goal gets a plain line", () => {
    expect(activeGoal("robust")).toBe("robust");
    expect(activeGoal("power")).toBeNull();
    expect(activeGoal("stronger")).toBeNull();
    expect(activeGoal(null)).toBeNull();
    expect(retiredGoalNote("power")?.en).toMatch(/More explosive.*no longer adds a set/);
    expect(retiredGoalNote("stronger")?.is).toMatch(/Sterkari fætur.*bætir ekki lengur við setti/);
    expect(retiredGoalNote("robust")).toBeNull();
    expect(retiredGoalNote(null)).toBeNull();
  });

  it("wiring: the one engine input reads the goal through activeGoal; both picks routes offer only active goals", () => {
    const root = join(__dirname, "..", "..", "..", "..", "..");
    const read = (f: string) => readFileSync(join(root, f), "utf8");
    expect(read("src/lib/micropulse/playerContext/domains.ts")).toMatch(/const goal = activeGoal\(r\.strength_goal\);/);
    expect(read("src/lib/micropulse/playerContext/domains.ts")).not.toMatch(/sanitizeGoal/);
    for (const f of ["src/app/api/player/strength-picks/route.ts", "src/app/api/coach/team/player-strength-picks/route.ts"]) {
      const src = read(f);
      expect(src).toMatch(/ACTIVE_STRENGTH_GOALS\.map/);
      expect(src).not.toMatch(/\bSTRENGTH_GOALS\.map/);
      expect(src).toMatch(/retiredGoalNote\(/);
    }
  });
});

describe("engine", () => {
  const mds: MdContext[] = ["MD-4", "MD-3", "MD-2", "MD-1", "MD+1"];
  const goals: StrengthGoal[] = ["stronger", "power", "robust"];

  it("no goal = exactly the session as before, every MD day", () => {
    for (const md of mds) {
      const a = buildStrengthSession(snap({ mdContext: md }));
      const b = buildStrengthSession(snap({ mdContext: md, playerStrengthGoal: undefined }));
      expect(b).toEqual(a);
    }
  });

  it("off the goal's days nothing changes and nothing is said", () => {
    for (const g of goals) {
      for (const md of mds) {
        if (GOAL_DAYS[g].includes(md)) continue;
        expect(buildStrengthSession(snap({ mdContext: md, playerStrengthGoal: g }))).toEqual(buildStrengthSession(snap({ mdContext: md })));
      }
    }
  });

  it("stronger, MD-4: the main leg lift gets one more set, marked as the goal", () => {
    const a = buildStrengthSession(snap());
    const s = buildStrengthSession(snap({ playerStrengthGoal: "stronger" }));
    const [g] = goalEx(s);
    expect(goalEx(s)).toHaveLength(1);
    expect(["COMPOUND_STRENGTH", "UNILATERAL_STRENGTH"]).toContain(g.category);
    expect(g.dose.sets).toBe(sets(a, g.exerciseId)! + 1);
    expect(ids(s)).toEqual(ids(a)); // same exercises, one more set
    expect(rule(s, "PLAYER_GOAL_APPLIED")?.actionEN).toMatch(/One more set/);
  });

  it("power, MD-3: the first jump / fast lift gets one more set", () => {
    const a = buildStrengthSession(snap({ mdContext: "MD-3" }));
    const s = buildStrengthSession(snap({ mdContext: "MD-3", playerStrengthGoal: "power" }));
    const [g] = goalEx(s);
    expect(["EXPLOSIVE_OLYMPIC", "PLYOMETRIC", "BALLISTIC", "MED_BALL"]).toContain(g.category);
    expect(g.dose.sets).toBe(sets(a, g.exerciseId)! + 1);
  });

  it("robust, MD-4: the Nordic gets one more set", () => {
    const a = buildStrengthSession(snap());
    const s = buildStrengthSession(snap({ playerStrengthGoal: "robust" }));
    expect(goalEx(s).map((e) => e.exerciseId)).toEqual(["ex_nordic_curl"]);
    expect(sets(s, "ex_nordic_curl")).toBe(sets(a, "ex_nordic_curl")! + 1);
  });

  it("no extra set on a yellow day, a red day, or in a two-match week (with the reason)", () => {
    for (const over of [{ verdict: "MODIFIED" as const }, { verdict: "REDUCED" as const }, { isCongestedWeek: true }]) {
      const s = buildStrengthSession(snap({ ...over, playerStrengthGoal: "stronger" }));
      const base = buildStrengthSession(snap(over));
      expect(goalEx(s)).toEqual([]);
      expect(s!.blocks).toEqual(base!.blocks);
      expect(rule(s, "PLAYER_GOAL_PAUSED")).toBeDefined();
    }
    const red = buildStrengthSession(snap({ verdict: "RECOVERY", playerStrengthGoal: "robust" }));
    expect(goalEx(red)).toEqual([]);
    expect(ids(red)).not.toContain("ex_nordic_curl");
  });

  it("robust: no extra Nordic set on a run of heavy braking days", () => {
    const s = buildStrengthSession(snap({ decelBurdenHighStreakDays: 3, playerStrengthGoal: "robust" }));
    expect(goalEx(s)).toEqual([]);
    expect(rule(s, "PLAYER_GOAL_PAUSED")?.actionEN).toMatch(/braking/);
  });

  it("sore hamstrings + robust: the Nordic stays out, the hamstring bridge is not pumped", () => {
    const base = buildStrengthSession(snap({ wellness: sore("hamstring") }));
    const s = buildStrengthSession(snap({ wellness: sore("hamstring"), playerStrengthGoal: "robust" }));
    expect(ids(s)).not.toContain("ex_nordic_curl");
    expect(goalEx(s)).toEqual([]);
    expect(s!.blocks).toEqual(base!.blocks);
  });

  it("sore lower back + stronger: the safety swap (front squat) is never pumped", () => {
    const base = buildStrengthSession(snap({ wellness: sore("lower_back") }));
    const s = buildStrengthSession(snap({ wellness: sore("lower_back"), playerStrengthGoal: "stronger" }));
    expect(ids(s)).toContain("ex_front_squat");
    expect(sets(s, "ex_front_squat")).toBe(sets(base, "ex_front_squat"));
    expect(goalEx(s).map((e) => e.exerciseId)).not.toContain("ex_front_squat");
  });

  it("standard mode ignores the goal", () => {
    const a = buildStrengthSession(snap(), [], { mode: "standard" });
    const b = buildStrengthSession(snap({ playerStrengthGoal: "stronger" }), [], { mode: "standard" });
    expect(b).toEqual(a);
  });

  it("the player's card says \"Your goal: +1 set\" / \"Þitt markmið: +1 sett\"", () => {
    const s = buildStrengthSession(snap({ playerStrengthGoal: "robust" }))!;
    const item = (lang: "EN" | "IS") => strengthSessionToTodayStructure(s, lang).flatMap((b) => b.items).find((i) => i.exerciseId === "ex_nordic_curl");
    expect(item("EN")?.note).toBe("Your goal: +1 set");
    expect(item("IS")?.note).toBe("Þitt markmið: +1 sett");
  });
});

describe("deficit-ledger emphasis never undoes safety (fix 2026-11-17)", () => {
  it("sore hamstrings + an eccentric emphasis: the Nordic is not added back", () => {
    const s = buildStrengthSession(snap({ wellness: sore("hamstring"), ledgerEmphases: ["eccentric"] }));
    expect(ids(s)).not.toContain("ex_nordic_curl");
  });

  it("a recovery day stays a recovery day: no emphasis exercise is added", () => {
    const s = buildStrengthSession(snap({ verdict: "RECOVERY", ledgerEmphases: ["plyometric", "unilateral", "eccentric", "max_strength"] }));
    expect(ids(s)).toEqual(ids(buildStrengthSession(snap({ verdict: "RECOVERY" }))));
    expect(rule(s, "LEDGER_EMPHASIS_ADD")).toBeUndefined();
  });

  it("a green day still gets the emphasis as before", () => {
    const s = buildStrengthSession(snap({ codAsymmetryPct: null, ledgerEmphases: ["plyometric"] }));
    expect(rule(s, "LEDGER_EMPHASIS_ADD") ?? rule(s, "LEDGER_EMPHASIS_CONFIRM")).toBeDefined();
  });
});

describe("season: the extra set is building, so only in pre-season and off-season (2026-11-17)", () => {
  const goals: StrengthGoal[] = ["stronger", "power", "robust"];
  const inSeason = { goalSeason: { phase: "competitive" as const, blockGoal: "transmute" as const } };

  it("in season: the session is exactly the maintenance session, with the reason, on every goal day", () => {
    for (const g of goals) {
      for (const md of GOAL_DAYS[g] as MdContext[]) {
        const base = buildStrengthSession(snap({ ...inSeason, mdContext: md }));
        const s = buildStrengthSession(snap({ ...inSeason, mdContext: md, playerStrengthGoal: g }));
        expect(s!.blocks).toEqual(base!.blocks);
        expect(goalEx(s)).toEqual([]);
        expect(rule(s, "PLAYER_GOAL_PAUSED")?.actionEN).toMatch(/maintenance/);
      }
    }
  });

  it("pre-season gets the set like off-season", () => {
    const s = buildStrengthSession(snap({ goalSeason: { phase: "preseason", blockGoal: "accum" }, playerStrengthGoal: "stronger" }));
    expect(goalEx(s)).toHaveLength(1);
  });

  it("the season plan wins over the week setup; without a plan the week setup decides; unknown = maintenance", () => {
    expect(goalSeasonOf({ goalSeason: { phase: "competitive", blockGoal: null }, seasonPhase: "preseason" })).toBe("maintain");
    expect(goalSeasonOf({ goalSeason: { phase: "offseason", blockGoal: null }, seasonPhase: "inseason" })).toBe("build");
    expect(goalSeasonOf({ seasonPhase: "preseason" })).toBe("build");
    expect(goalSeasonOf({ seasonPhase: "offseason" })).toBe("build");
    expect(goalSeasonOf({ seasonPhase: "inseason" })).toBe("maintain");
    expect(goalSeasonOf({ seasonPhase: "in_season" })).toBe("maintain");
    expect(goalSeasonOf({ seasonPhase: "playoffs" })).toBe("maintain");
    expect(goalSeasonOf({ seasonPhase: null })).toBe("unknown");
    expect(goalSeasonOf({})).toBe("unknown");

    const unknown = buildStrengthSession(snap({ goalSeason: null, seasonPhase: null, playerStrengthGoal: "stronger" }));
    expect(goalEx(unknown)).toEqual([]);
    expect(rule(unknown, "PLAYER_GOAL_PAUSED")?.actionEN).toMatch(/maintenance/);
    const weekSetup = buildStrengthSession(snap({ goalSeason: null, seasonPhase: "preseason", playerStrengthGoal: "stronger" }));
    expect(goalEx(weekSetup)).toHaveLength(1);
  });

  it("a light week or a taper block in the plan: no extra set", () => {
    for (const blockGoal of ["deload", "realize"] as const) {
      const s = buildStrengthSession(snap({ goalSeason: { phase: "preseason", blockGoal }, playerStrengthGoal: "stronger" }));
      expect(goalEx(s)).toEqual([]);
      expect(rule(s, "PLAYER_GOAL_PAUSED")?.actionEN).toMatch(/light week|taper/);
    }
  });

  it("no match near, pre-/off-season: every strength session is a goal day (stronger on MD-3)", () => {
    const base = buildStrengthSession(snap({ mdContext: "MD-3", noMatchNearby: true }));
    const s = buildStrengthSession(snap({ mdContext: "MD-3", noMatchNearby: true, playerStrengthGoal: "stronger" }));
    const [g] = goalEx(s);
    expect(g).toBeDefined();
    expect(g.dose.sets).toBe(sets(base, g.exerciseId)! + 1);
    // With a match near, MD-3 is still not a "stronger" day.
    expect(goalEx(buildStrengthSession(snap({ mdContext: "MD-3", playerStrengthGoal: "stronger" })))).toEqual([]);
  });

  it("no match near in season: still maintenance, nothing changes", () => {
    const base = buildStrengthSession(snap({ ...inSeason, mdContext: "MD-3", noMatchNearby: true }));
    const s = buildStrengthSession(snap({ ...inSeason, mdContext: "MD-3", noMatchNearby: true, playerStrengthGoal: "stronger" }));
    expect(s).toEqual(base);
  });

  it("microdose: the Accumulation +1 skips the goal's exercise, so it gets +1 set, never +2", () => {
    const base = applyBlockToSession(buildStrengthSession(snap({ playerStrengthGoal: undefined })), "accum", "offseason")!;
    const s = applyBlockToSession(buildStrengthSession(snap({ playerStrengthGoal: "stronger" })), "accum", "offseason")!;
    const [g] = goalEx(s);
    expect(g).toBeDefined();
    // Same sets as the Accumulation session without a goal: one extra set, from the goal instead of the block.
    expect(g.dose.sets).toBe(sets(base, g.exerciseId));
    const plain = buildStrengthSession(snap())!;
    expect(g.dose.sets).toBe(sets(plain, g.exerciseId)! + 1);
  });

  it("microdose: no goal set on a day the player's data already added an exercise", () => {
    const emphases = ["plyometric", "unilateral", "eccentric", "max_strength"];
    const added = emphases.filter((e) => rule(buildStrengthSession(snap({ ledgerEmphases: [e] })), "LEDGER_EMPHASIS_ADD"));
    expect(added.length).toBeGreaterThan(0);
    for (const e of added) {
      const s = buildStrengthSession(snap({ ledgerEmphases: [e], playerStrengthGoal: "stronger" }));
      expect(goalEx(s)).toEqual([]);
      expect(rule(s, "PLAYER_GOAL_PAUSED")?.actionEN).toMatch(/already added/);
    }
  });

  it("withGoalSeason: only a player with a goal and a resolved block gets it; otherwise the same snapshot", () => {
    const noGoal = snap({ goalSeason: undefined });
    expect(withGoalSeason(noGoal, { phase: "offseason", goalKey: "accum" })).toBe(noGoal);
    const withGoal = snap({ goalSeason: undefined, playerStrengthGoal: "power" });
    expect(withGoalSeason(withGoal, null)).toBe(withGoal);
    expect(withGoalSeason(withGoal, { phase: "competitive", goalKey: "transmute" }).goalSeason).toEqual({ phase: "competitive", blockGoal: "transmute" });
  });
});
