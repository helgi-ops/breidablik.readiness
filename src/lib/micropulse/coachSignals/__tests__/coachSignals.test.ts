import { describe, it, expect } from "vitest";
import { deriveGamePlanFitSignal, derivePostTrainingSignal, deriveMatchMinutesSignal, isActionable } from "../index";

describe("deriveGamePlanFitSignal", () => {
  it("is steady (silent) with no upcoming fixture", () => {
    const s = deriveGamePlanFitSignal({ ok: true, fixture: null, rows: [{ verdict: "poor" }] });
    expect(s.level).toBe("steady");
    expect(isActionable(s)).toBe(false);
  });
  it("elevated when any player is a poor fit for the next match", () => {
    const s = deriveGamePlanFitSignal({ ok: true, fixture: { date: "2026-08-30", opponent: "KR" }, rows: [{ verdict: "poor", scored: true }, { verdict: "strong", scored: true }, { verdict: "caution", scored: true }] });
    expect(s.level).toBe("elevated");
    expect(s.why.en[0]).toMatch(/1 poor-fit, 1 caution vs KR/);
    expect(s.confidence).toBeTruthy();
  });
  it("watch when only cautions, no poor", () => {
    const s = deriveGamePlanFitSignal({ ok: true, fixture: { date: "2026-08-30", opponent: "KR" }, rows: [{ verdict: "caution", scored: true }, { verdict: "strong", scored: true }] });
    expect(s.level).toBe("watch");
  });
});

describe("derivePostTrainingSignal", () => {
  it("steady when the session tracked the plan", () => {
    const s = derivePostTrainingSignal({ ok: true, sessionDate: "2026-08-25", plannedVsActual: { players: [{ status: "on" }, { status: "over" }] } });
    expect(s.level).toBe("steady");
  });
  it("elevated when several players deviate well over/under plan", () => {
    const s = derivePostTrainingSignal({ ok: true, sessionDate: "2026-08-25", plannedVsActual: { players: [{ status: "well_over" }, { status: "well_over" }, { status: "well_under" }, { status: "on" }] } });
    expect(s.level).toBe("elevated");
    expect(s.why.en[0]).toMatch(/2 well over \/ 1 well under/);
  });
});

describe("deriveMatchMinutesSignal", () => {
  it("steady when there is no recent match", () => {
    expect(deriveMatchMinutesSignal({ recentMatch: null, entered: 0, roster: 20 }).level).toBe("steady");
  });
  it("task when a recent match has no minutes entered", () => {
    const s = deriveMatchMinutesSignal({ recentMatch: { date: "2026-08-24", opponent: "Valur" }, entered: 0, roster: 20 });
    expect(s.level).toBe("task");
    expect(s.why.en[0]).toMatch(/No minutes entered for Valur/);
  });
  it("steady once minutes have been entered (conservative — not a nag)", () => {
    expect(deriveMatchMinutesSignal({ recentMatch: { date: "2026-08-24", opponent: "Valur" }, entered: 11, roster: 20 }).level).toBe("steady");
  });
});
