/**
 * DSI suggests an 8-week gym goal (2026-11-17; pointed at the 8-week goals on 2026-11-18, goals step 3): lower third
 * of the team → "Explosive power", upper third → "Maximal strength", middle → nothing; never a pitch goal and never the
 * retired "+1 set" goals; nothing without a team read, a missing test, or a test over 12 months.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { squadDsiThresholds } from "../deriveDsi";
import { IMTP_SUGGESTION_SOURCE, squadImtpThreshold, suggestGoalFromDsi, type DsiSuggestionInput } from "../goalSuggestion";

// Team ratios 0.70 … 0.95 → lower third ≈ 0.78, upper third ≈ 0.87.
const squad = squadDsiThresholds([0.7, 0.75, 0.8, 0.82, 0.85, 0.9, 0.95])!;
const today = "2026-11-17";
const player = (ratio: number, over: Partial<DsiSuggestionInput> = {}): DsiSuggestionInput => ({
  cmjPeakForceN: 3000 * ratio,
  imtpPeakForceN: 3000,
  cmjTrialCount: 3,
  imtpTrialCount: 3,
  cmjTestDate: "2026-10-01",
  imtpTestDate: "2026-09-20",
  ...over,
});

describe("what DSI suggests", () => {
  it("lower third → Explosive power; upper third → Maximal strength; middle → nothing", () => {
    expect(suggestGoalFromDsi(player(0.72), squad, today)?.goal).toBe("explosive");
    expect(suggestGoalFromDsi(player(0.93), squad, today)?.goal).toBe("max_strength");
    expect(suggestGoalFromDsi(player(0.83), squad, today)).toBeNull();
  });

  it("only ever one of the two 8-week gym goals (never a pitch goal, never a retired +1-set goal)", () => {
    for (let r = 0.5; r <= 1.2; r += 0.01) {
      const g = suggestGoalFromDsi(player(r), squad, today)?.goal;
      if (g) expect(["explosive", "max_strength"]).toContain(g);
    }
  });

  it("carries the plain reason, the test dates, the team size and how sure it is", () => {
    const s = suggestGoalFromDsi(player(0.72), squad, today)!;
    expect(s.reasonEN).toMatch(/lower third of your team/);
    expect(s.reasonIS).toMatch(/neðsti þriðjungur liðsins/);
    expect(s).toMatchObject({ cmjDate: "2026-10-01", imtpDate: "2026-09-20", tested: 7, confidence: "high" });
    expect(s.source).toMatch(/Suchomel/);
    expect(suggestGoalFromDsi(player(0.72, { cmjTrialCount: 2 }), squad, today)?.confidence).toBe("moderate");
  });
});

describe("when DSI says nothing", () => {
  it("no team read (fewer than 4 tested)", () => {
    expect(suggestGoalFromDsi(player(0.72), squadDsiThresholds([0.7, 0.8, 0.9]), today)).toBeNull();
    expect(suggestGoalFromDsi(player(0.72), null, today)).toBeNull();
  });

  it("a test missing (force or date)", () => {
    expect(suggestGoalFromDsi(player(0.72, { imtpPeakForceN: null }), squad, today)).toBeNull();
    expect(suggestGoalFromDsi(player(0.72, { cmjPeakForceN: null }), squad, today)).toBeNull();
    expect(suggestGoalFromDsi(player(0.72, { imtpTestDate: null }), squad, today)).toBeNull();
    expect(suggestGoalFromDsi(null, squad, today)).toBeNull();
  });

  it("a test older than 12 months", () => {
    expect(suggestGoalFromDsi(player(0.72, { imtpTestDate: "2025-11-01" }), squad, today)).toBeNull();
    expect(suggestGoalFromDsi(player(0.72, { cmjTestDate: "2025-11-17" }), squad, today)?.goal).toBe("explosive"); // exactly 365 days
  });
});

describe("the strength test first: mid-thigh pull per kg in the team's lower third (brief §4a)", () => {
  // Team N/kg 28 … 40 → lower third = 32.
  const imtpSquad = squadImtpThreshold([28, 30, 32, 34, 36, 38, 40])!;

  it("the cut is the team's lower third, from 4 or more tested", () => {
    expect(imtpSquad).toEqual({ lower: 32, n: 7 });
    expect(squadImtpThreshold([30, 32, 34])).toBeNull();
    expect(squadImtpThreshold([30, null, 32, undefined, 34, 0])).toBeNull();
  });

  it("a weak pull → Maximal strength, even when the DSI points to Explosive power", () => {
    const s = suggestGoalFromDsi(player(0.72, { imtpRelNkg: 29.4 }), squad, today, imtpSquad)!;
    expect(s).toMatchObject({ goal: "max_strength", basis: "imtp", imtpDate: "2026-09-20", cmjDate: "2026-10-01", tested: 7, confidence: "high" });
    expect(s.reasonEN).toBe("Your mid-thigh pull is 29.4 N per kg of body weight, in the lower third of your team. More strength is the next step.");
    expect(s.reasonIS).toContain("29,4 N á hvert kg");
    expect(s.source).toBe(IMTP_SUGGESTION_SOURCE);
  });

  it("needs only the pull: no jump test, no DSI team read", () => {
    const s = suggestGoalFromDsi(player(0.72, { cmjPeakForceN: null, cmjTestDate: null, imtpRelNkg: 30 }), null, today, imtpSquad)!;
    expect(s).toMatchObject({ goal: "max_strength", cmjDate: null });
  });

  it("a pull in the middle or above → the DSI decides as before; an old pull → nothing", () => {
    expect(suggestGoalFromDsi(player(0.72, { imtpRelNkg: 35 }), squad, today, imtpSquad)).toMatchObject({ goal: "explosive", basis: "dsi" });
    expect(suggestGoalFromDsi(player(0.72, { imtpRelNkg: 29, imtpTestDate: "2025-11-01" }), squad, today, imtpSquad)).toBeNull();
    expect(suggestGoalFromDsi(player(0.72, { imtpRelNkg: 29 }), squad, today, null)?.goal).toBe("explosive");
  });
});

describe("wiring", () => {
  const root = join(__dirname, "..", "..", "..", "..", "..");
  const read = (p: string) => readFileSync(join(root, p), "utf8");

  it("My goal gets the suggestion, only for a player who can start a goal now and only for a goal they can pick", () => {
    const route = read("src/app/api/player/goal-plan/route.ts");
    expect(route).toMatch(/loadDsiGoalSuggestions/);
    expect(route).toMatch(/const sug = autoStart && !open \? dsi\.get\(playerId\) \?\? null : null;/);
    expect(route).toMatch(/e\.quality === sug\.goal && !e\.blocked/);
    // The request still takes the goal from the body only: the suggestion never decides.
    expect(route).not.toMatch(/quality: (sug|dsi)/);
  });

  it("the coach's picks panel still shows the suggestion; the picks routes no longer store it with the hamstring goal", () => {
    const coach = read("src/app/api/coach/team/player-strength-picks/route.ts");
    expect(coach).toMatch(/suggestion: suggestions\.get\(p\.id\) \?\? null/);
    expect(coach).not.toMatch(/dsiSuggested/);
    const player = read("src/app/api/player/strength-picks/route.ts");
    expect(player).not.toMatch(/loadDsiGoalSuggestions|dsiSuggested/);
    const store = read("src/lib/micropulse/strengthProgramming/playerPicksStore.ts");
    expect(store).toMatch(/after: \{ goal: args\.goal \}/);
  });
});
