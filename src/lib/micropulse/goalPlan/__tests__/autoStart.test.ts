/**
 * Goal plans without approval (lota 3 of player choices, 2026-11-17): the start date, who may take a goal back, the
 * history labels, and that the player route reads the switch on the server (never from the body).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AUTO_STARTED_EVENT_LABEL,
  COACH_STARTED_LABEL,
  EVENT_LABEL,
  autoStartDate,
  eventLabel,
  playerMayWithdraw,
} from "../requests";
import { choicesOn, goalsWithoutApproval } from "../../strengthProgramming/playerPicksStore";

describe("which switch does what (lota 4: every team, list or not)", () => {
  const withList = { slots: {}, hasList: true };
  const noList = { slots: {}, hasList: false };
  it("8-week goals start without approval on the team switch or the test player, with or without a list", () => {
    for (const cfg of [withList, noList]) {
      expect(goalsWithoutApproval({ ...cfg, enabled: true }, null)).toBe(true);
      expect(goalsWithoutApproval({ ...cfg, enabled: false }, { testEnabled: true })).toBe(true);
      expect(goalsWithoutApproval({ ...cfg, enabled: false }, { testEnabled: false })).toBe(false);
      expect(goalsWithoutApproval({ ...cfg, enabled: false }, null)).toBe(false);
    }
  });
  it("exercise picks and the strength goal still need the team list", () => {
    expect(choicesOn({ ...withList, enabled: true }, null)).toBe(true);
    expect(choicesOn({ ...noList, enabled: true }, null)).toBe(false);
    expect(choicesOn({ ...noList, enabled: false }, { testEnabled: true })).toBe(false);
  });
});

describe("start date", () => {
  it("the Monday on or after today", () => {
    expect(autoStartDate("2026-11-17")).toBe("2026-11-23"); // Tuesday → next Monday
    expect(autoStartDate("2026-11-22")).toBe("2026-11-23"); // Sunday → tomorrow
    expect(autoStartDate("2026-11-23")).toBe("2026-11-23"); // Monday → today
  });
});

describe("the player may take a goal back", () => {
  const today = "2026-11-17";
  it("a request the coach has not answered", () => {
    expect(playerMayWithdraw({ status: "requested", start_date: null }, today)).toBe(true);
  });
  it("an auto-started plan before its first day, not on or after it", () => {
    expect(playerMayWithdraw({ status: "approved", start_date: "2026-11-23", auto_started: true }, today)).toBe(true);
    expect(playerMayWithdraw({ status: "approved", start_date: "2026-11-17", auto_started: true }, today)).toBe(false);
    expect(playerMayWithdraw({ status: "approved", start_date: "2026-11-16", auto_started: true }, today)).toBe(false);
  });
  it("never a plan the coach approved or started, nor a paused / finished one", () => {
    expect(playerMayWithdraw({ status: "approved", start_date: "2026-11-23", auto_started: false }, today)).toBe(false);
    expect(playerMayWithdraw({ status: "approved", start_date: "2026-11-23" }, today)).toBe(false);
    expect(playerMayWithdraw({ status: "paused", start_date: "2026-11-23", auto_started: true }, today)).toBe(false);
    expect(playerMayWithdraw({ status: "completed", start_date: "2026-09-01", auto_started: true }, today)).toBe(false);
  });
});

describe("history labels", () => {
  it("system approval = started right away; coach approval unchanged; coach start unchanged", () => {
    expect(eventLabel({ kind: "approved", actor_role: "system" })).toBe(AUTO_STARTED_EVENT_LABEL);
    expect(eventLabel({ kind: "approved", actor_role: "coach" })).toBe(EVENT_LABEL.approved);
    expect(eventLabel({ kind: "requested", actor_role: "coach" })).toBe(COACH_STARTED_LABEL);
    expect(eventLabel({ kind: "requested", actor_role: "player" })).toBe(EVENT_LABEL.requested);
  });
});

describe("wiring", () => {
  const root = join(__dirname, "..", "..", "..", "..", "..");
  const route = readFileSync(join(root, "src/app/api/player/goal-plan/route.ts"), "utf8");
  const store = readFileSync(join(root, "src/lib/micropulse/goalPlan/store.ts"), "utf8");

  it("the player route reads the switch on the server and never takes autoStart from the body", () => {
    expect(route).toMatch(/const autoStart = await goalsWithoutApprovalFor\(sb, teamId, playerId\)/);
    expect(route).not.toMatch(/body\.autoStart/);
  });

  it("an auto start goes through the same checks as an approval (approvedPlan) and is logged as a system approval", () => {
    const from = store.indexOf("async function startGoalByPlayer");
    expect(from).toBeGreaterThan(0);
    const fn = store.slice(from, store.indexOf("export async function", from));
    expect(fn).toMatch(/approvedPlan\(args\.input, args\.teamPref, d\)/);
    expect(fn).toMatch(/auto_started: true/);
    expect(fn).toMatch(/role: "system"/);
    // No coach-only choices: no start override, no level, no reason.
    expect(fn).toMatch(/start: null, reason: null, noteToPlayer: null, level: null/);
  });
});
