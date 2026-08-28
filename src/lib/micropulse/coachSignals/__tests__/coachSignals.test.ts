import { describe, it, expect } from "vitest";
import { deriveGamePlanFitSignal, derivePostTrainingSignal, deriveMatchMinutesSignal, deriveFormVsStateSignal, derivePlayerFormVsStateSignals, deriveRobustnessTeamSignal, derivePlayerRobustnessSignals, deriveHrvTeamSignal, derivePlayerHrvSignals, isActionable, type FormVsStateReadLite, type FormVsStatePlayerLite, type RobustnessReadLite, type HrvReadLite } from "../index";

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

describe("robustness signals", () => {
  const R = (over: Partial<RobustnessReadLite>): RobustnessReadLite => ({
    playerId: "p", name: "Ari", level: "steady",
    verdict: { en: "Ari — steady.", is: "Ari — stöðugt." },
    counterfactual: null, confidence: "high", ...over,
  });

  describe("deriveRobustnessTeamSignal (conservative — strip-worthy only)", () => {
    it("silent when all steady", () => {
      expect(deriveRobustnessTeamSignal([R({}), R({}), R({})]).level).toBe("steady");
    });
    it("silent on a LONE watch (base rate too common for the team strip)", () => {
      const s = deriveRobustnessTeamSignal([R({ level: "watch" }), R({}), R({})]);
      expect(s.level).toBe("steady");
      expect(isActionable(s)).toBe(false);
    });
    it("watch on exactly two watches", () => {
      expect(deriveRobustnessTeamSignal([R({ playerId: "a", name: "A", level: "watch" }), R({ playerId: "b", name: "B", level: "watch" })]).level).toBe("watch");
    });
    it("elevated on a cluster of three+ watches", () => {
      const s = deriveRobustnessTeamSignal([R({ name: "A", level: "watch" }), R({ name: "B", level: "watch" }), R({ name: "C", level: "watch" })]);
      expect(s.level).toBe("elevated");
      expect(s.why.en[0]).toMatch(/3 players on a robustness watch: A, B, C/);
    });
    it("elevated whenever any single player is elevated, and names him", () => {
      const s = deriveRobustnessTeamSignal([R({ name: "Jón", level: "elevated", confidence: "high" }), R({})]);
      expect(s.level).toBe("elevated");
      expect(s.why.en[0]).toMatch(/1 elevated robustness signal: Jón/);
      expect(s.confidence).toBe("high");
    });
  });

  describe("derivePlayerRobustnessSignals (attention-row enrichment)", () => {
    it("emits one chip per non-steady player, carrying the verdict + link", () => {
      const out = derivePlayerRobustnessSignals([
        R({ playerId: "a", level: "steady" }),
        R({ playerId: "b", name: "Beta", level: "watch", verdict: { en: "Beta — watch.", is: "Beta — viðvörun." } }),
        R({ playerId: "c", name: "Gam", level: "elevated", verdict: { en: "Gam — elevated.", is: "Gam — hækkað." } }),
      ]);
      expect(out.map((x) => x.playerId)).toEqual(["b", "c"]);
      expect(out[0].signal.engine).toBe("robustness");
      expect(out[0].signal.level).toBe("watch");
      expect(out[0].signal.why.en[0]).toBe("Beta — watch.");
      expect(out[0].signal.href).toBe("/coach/readiness-signals");
      expect(out[1].signal.level).toBe("elevated");
    });
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

describe("HRV recovery signals", () => {
  const H = (over: Partial<HrvReadLite>): HrvReadLite => ({
    playerId: "p", name: "Ari", level: "steady",
    verdict: { en: "steady", is: "stöðugt" }, confidence: "high", ...over,
  });

  it("team strip: silent on all-steady and on a lone watch, elevated on a cluster", () => {
    expect(deriveHrvTeamSignal([H({}), H({})]).level).toBe("steady");
    expect(deriveHrvTeamSignal([H({ level: "watch" }), H({})]).level).toBe("steady"); // lone watch
    expect(deriveHrvTeamSignal([H({ name: "A", level: "watch" }), H({ name: "B", level: "watch" }), H({ name: "C", level: "watch" })]).level).toBe("elevated");
  });
  it("team strip: elevated whenever any player is elevated, names him", () => {
    const s = deriveHrvTeamSignal([H({ name: "Jón", level: "elevated" }), H({})]);
    expect(s.level).toBe("elevated");
    expect(s.why.en[0]).toMatch(/1 with a down recovery trend: Jón/);
  });
  it("per-player: one chip per non-steady player; medium confidence maps to moderate", () => {
    const out = derivePlayerHrvSignals([H({ playerId: "a", level: "steady" }), H({ playerId: "b", name: "Beta", level: "watch", confidence: "medium", verdict: { en: "dip", is: "dýfa" } })]);
    expect(out.map((x) => x.playerId)).toEqual(["b"]);
    expect(out[0].signal.engine).toBe("hrv_recovery");
    expect(out[0].signal.confidence).toBe("moderate");
    expect(out[0].signal.href).toBe("/coach/heart-rate-intelligence");
  });
});
