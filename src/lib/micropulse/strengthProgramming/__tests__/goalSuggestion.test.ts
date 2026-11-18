/**
 * DSI suggests an 8-week gym goal (2026-11-17; pointed at the 8-week goals on 2026-11-18, goals step 3): lower third
 * of the team → "Explosive power", upper third → "Maximal strength", middle → nothing; never a pitch goal and never the
 * retired "+1 set" goals; nothing without a team read, a missing test, or a test over 12 months.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { squadDsiThresholds } from "../deriveDsi";
import { suggestGoalFromDsi, type DsiSuggestionInput } from "../goalSuggestion";

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
