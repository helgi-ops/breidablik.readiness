import { describe, it, expect } from "vitest";
import { deriveGamePlanFitSignal, derivePostTrainingSignal, deriveMatchMinutesSignal, deriveFormVsStateSignal, derivePlayerFormVsStateSignals, isActionable, type FormVsStateReadLite, type FormVsStatePlayerLite } from "../index";

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

describe("deriveFormVsStateSignal", () => {
  const R = (name: string, verdict: FormVsStateReadLite["verdict"], confidence: FormVsStateReadLite["confidence"] = "moderate"): FormVsStateReadLite => ({ name, verdict, confidence });

  it("steady (silent) when nobody is in a genuine dip", () => {
    const s = deriveFormVsStateSignal([R("A", "steady"), R("B", "explained_by_state"), R("C", "overperforming_compromised"), R("D", "unknown")]);
    expect(s.level).toBe("steady");
    expect(isActionable(s)).toBe(false);
  });
  it("watch when exactly one player has a genuine form dip", () => {
    const s = deriveFormVsStateSignal([R("Jón", "genuine_dip"), R("B", "steady")]);
    expect(s.level).toBe("watch");
    expect(s.why.en[0]).toMatch(/1 in a genuine form dip: Jón/);
    expect(s.confidence).toBe("moderate");
  });
  it("elevated when two or more genuine dips, high confidence bubbles up, names listed", () => {
    const s = deriveFormVsStateSignal([R("Jón", "genuine_dip", "high"), R("Ari", "genuine_dip"), R("C", "steady")]);
    expect(s.level).toBe("elevated");
    expect(s.why.en[0]).toMatch(/2 in a genuine form dip: Jón, Ari/);
    expect(s.confidence).toBe("high");
  });
  it("ignores low-confidence dips (mostly-imputed readiness) — the over-flagging guard", () => {
    const s = deriveFormVsStateSignal([R("A", "genuine_dip", "low"), R("B", "genuine_dip", "low")]);
    expect(s.level).toBe("steady");
  });
  it("caps the named list at 3 and shows a +N overflow", () => {
    const s = deriveFormVsStateSignal([R("A", "genuine_dip"), R("B", "genuine_dip"), R("C", "genuine_dip"), R("D", "genuine_dip")]);
    expect(s.level).toBe("elevated");
    expect(s.why.en[0]).toMatch(/A, B, C \+1/);
  });
});

describe("derivePlayerFormVsStateSignals", () => {
  const P = (over: Partial<FormVsStatePlayerLite>): FormVsStatePlayerLite => ({
    playerId: "p1", name: "Jón", verdict: "genuine_dip", confidence: "moderate", windowMean: 0.06, baselinePer90: 0.15, ...over,
  });

  it("emits one per-player watch chip per genuine dip, with %-vs-norm and a player link", () => {
    const out = derivePlayerFormVsStateSignals([P({ playerId: "abc", windowMean: 0.06, baselinePer90: 0.15 })]);
    expect(out).toHaveLength(1);
    expect(out[0].playerId).toBe("abc");
    expect(out[0].signal.engine).toBe("form_vs_state");
    expect(out[0].signal.level).toBe("watch");
    expect(out[0].signal.why.en[0]).toMatch(/-60% vs his norm/); // (0.06/0.15 - 1) = -60%
    expect(out[0].signal.href).toBe("/coach/form-vs-state?playerId=abc");
    expect(isActionable(out[0].signal)).toBe(true);
  });
  it("degrades a >100% collapse (negative output) to plain words, never a nonsensical %", () => {
    const out = derivePlayerFormVsStateSignals([P({ playerId: "x", windowMean: -0.02, baselinePer90: 0.06 })]);
    expect(out[0].signal.why.en[0]).toMatch(/well below his norm/);
    expect(out[0].signal.why.en[0]).not.toMatch(/%/);
  });
  it("excludes non-dips and low-confidence dips (mostly-imputed readiness)", () => {
    const out = derivePlayerFormVsStateSignals([
      P({ playerId: "a", verdict: "steady" }),
      P({ playerId: "b", verdict: "explained_by_state" }),
      P({ playerId: "c", verdict: "genuine_dip", confidence: "low" }),
      P({ playerId: "d", verdict: "genuine_dip", confidence: "high" }),
    ]);
    expect(out.map((x) => x.playerId)).toEqual(["d"]);
    expect(out[0].signal.confidence).toBe("high");
  });
  it("degrades gracefully when the norm is missing", () => {
    const out = derivePlayerFormVsStateSignals([P({ playerId: "e", windowMean: null, baselinePer90: null })]);
    expect(out[0].signal.why.en[0]).toMatch(/below his norm/);
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
