/**
 * Three send modes (2026-11-17): standard / individualised (data + screen) / individualised + goals. The team's mode
 * is the switch for player choices; per player the coach can take someone out (goals mode) or let one in (other mode).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildModeFor, isSendMode, normalizeSendMode, takesPart, type SendMode } from "../sendMode";
import { buildStrengthSession } from "../index";
import { withGoalPlanGym, type GoalPlanGym } from "../goalPlanGym";
import type { PaletteSlots } from "../palette";
import type { MdContext, PlayerChoiceAccess, PlayerStrengthSnapshot } from "../types";

describe("who takes part", () => {
  const cases: [SendMode, { on?: boolean; off?: boolean } | null, boolean][] = [
    ["standard", null, false],
    ["standard", { on: true }, false],
    ["individualised", null, false],
    ["individualised", { on: true }, true],
    ["individualised", { off: true }, false],
    ["individualised_goals", null, true],
    ["individualised_goals", { on: true }, true],
    ["individualised_goals", { off: true }, false],
  ];
  it.each(cases)("%s with %j → %s", (mode, s, expected) => {
    expect(takesPart(mode, s)).toBe(expected);
  });

  it("the build mode: standard stays standard; the goals mode only for players who take part", () => {
    expect(buildModeFor("standard", { on: true })).toBe("standard");
    expect(buildModeFor("individualised", null)).toBe("individualised");
    expect(buildModeFor("individualised", { on: true })).toBe("individualised_goals");
    expect(buildModeFor("individualised_goals", null)).toBe("individualised_goals");
    expect(buildModeFor("individualised_goals", { off: true })).toBe("individualised");
  });

  it("unknown values → individualised (the default before); only the three are valid in a request", () => {
    expect(normalizeSendMode(undefined)).toBe("individualised");
    expect(normalizeSendMode("nonsense")).toBe("individualised");
    expect(normalizeSendMode("standard")).toBe("standard");
    expect(normalizeSendMode("individualised_goals")).toBe("individualised_goals");
    expect(isSendMode("individualised_goals")).toBe(true);
    expect(isSendMode("goals")).toBe(false);
  });
});

const PALETTE: PaletteSlots = {
  isometric: ["ex_imtp_iso"],
  upper_body: ["ex_db_bench_press"],
  power_explosive: ["ex_box_jump", "ex_depth_jump"],
  bilateral_strength: ["ex_hip_thrust", "ex_back_squat"],
  unilateral_strength: ["ex_reverse_lunge"],
};
const snap = (over: Partial<PlayerStrengthSnapshot> = {}): PlayerStrengthSnapshot => ({
  playerId: "p1", todayIso: "2026-11-16", mdContext: "MD-4" as MdContext, verdict: "FULL",
  sprintSpeedDropPct: null, sprintExposureBand: null, codAsymmetryPct: null, decelBurdenBand: null, decelBurdenHighStreakDays: 0,
  wellness: { sleepQuality: null, muscleSoreness: null, fatigueEnergy: null, stressMood: null, soreAreas: [] },
  vbtDecrement: null, injuryStatus: "cleared", fosterMonotony: null, fosterStrain: null, isCongestedWeek: false,
  teamPalette: PALETTE, seasonPhase: null, goalSeason: { phase: "preseason", blockGoal: "transmute" }, ...over,
});
const GYM: GoalPlanGym = {
  planId: "plan1", quality: "acceleration", week: 1, weeksTotal: 8, labelEN: "Gym", labelIS: "Salur",
  lifts: [{ profile: "heavy", nameEN: "Back squat", nameIS: "Hnébeygja", sets: "4", reps: "3–5", intensity: "80–90% 1RM", rest: "3 min", cue: null }],
};
// The player's own input: a pick, a strength goal and today's goal-plan gym session.
const withInput = (access?: PlayerChoiceAccess) => withGoalPlanGym(snap({
  playerExercisePicks: { power_explosive: ["ex_depth_jump"] },
  playerStrengthGoal: "power",
  ...(access ? { playerChoiceAccess: access } : {}),
}), GYM);
const plain = (access?: PlayerChoiceAccess) => snap(access ? { playerChoiceAccess: access } : {});
const json = (s: unknown) => JSON.stringify(s);

describe("the engine uses the player's input only when they take part", () => {
  const goalsTeam: PlayerChoiceAccess = { teamMode: "individualised_goals", on: false, off: false };
  const dataTeam: PlayerChoiceAccess = { teamMode: "individualised", on: false, off: false };

  it("the player's input changes the session when they take part (so the checks below mean something)", () => {
    expect(json(buildStrengthSession(withInput(goalsTeam)))).not.toBe(json(buildStrengthSession(plain(goalsTeam))));
  });

  it("individualised (data + screen): exactly the session without the player's input", () => {
    expect(json(buildStrengthSession(withInput(goalsTeam), [], { mode: "individualised" }))).toBe(json(buildStrengthSession(plain(goalsTeam), [], { mode: "individualised" })));
    // No mode given → the team's mode decides.
    expect(json(buildStrengthSession(withInput(dataTeam)))).toBe(json(buildStrengthSession(plain(dataTeam))));
  });

  it("individualised + goals: the same as before the modes (input used), unless the coach took the player out", () => {
    const before = json(buildStrengthSession(withInput()));
    expect(json(buildStrengthSession(withInput(goalsTeam), [], { mode: "individualised_goals" }))).toBe(before);
    const out: PlayerChoiceAccess = { ...goalsTeam, off: true };
    expect(json(buildStrengthSession(withInput(out), [], { mode: "individualised_goals" }))).toBe(json(buildStrengthSession(plain(out), [], { mode: "individualised_goals" })));
  });

  it("a player the coach let in on the data + screen mode keeps their input", () => {
    const letIn: PlayerChoiceAccess = { ...dataTeam, on: true };
    expect(json(buildStrengthSession(withInput(letIn), [], { mode: "individualised" }))).not.toBe(json(buildStrengthSession(plain(letIn), [], { mode: "individualised" })));
  });

  it("standard: the player's input never matters", () => {
    expect(json(buildStrengthSession(withInput(goalsTeam), [], { mode: "standard" }))).toBe(json(buildStrengthSession(plain(goalsTeam), [], { mode: "standard" })));
  });
});

describe("wiring", () => {
  const root = join(__dirname, "..", "..", "..", "..", "..");
  const read = (p: string) => readFileSync(join(root, p), "utf8");
  it("the send routes accept the three modes and the team's mode is the only player-choice switch", () => {
    for (const p of [
      "src/app/api/coach/team/send-strength-sessions/route.ts",
      "src/app/api/coach/player/[id]/send-strength-session/route.ts",
      "src/app/api/strength/auto-send/route.ts",
      "src/app/api/coach/team/strength-send-mode/route.ts",
    ]) expect(read(p)).toMatch(/normalizeSendMode\(/);
    expect(read("src/lib/micropulse/playerContext/domains.ts")).not.toMatch(/player_picks_enabled/);
    expect(read("src/lib/micropulse/strengthProgramming/playerPicksStore.ts")).not.toMatch(/select\([^)]*player_picks_enabled/);
  });
  it("a player who doesn't take part can't start an 8-week goal", () => {
    const route = read("src/app/api/player/goal-plan/route.ts");
    expect(route).toMatch(/if \(!autoStart\) \{/);
    expect(route).toMatch(/\}, \{ status: 403 \}\);/);
  });
});
