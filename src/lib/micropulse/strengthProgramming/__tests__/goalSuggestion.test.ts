/**
 * DSI suggests a strength goal (2026-11-17): lower third of the team → "More explosive", upper third → "Stronger legs",
 * middle → nothing; never "Stronger hamstrings"; nothing without a team read, a missing test, or a test over 12 months.
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
  it("lower third → More explosive; upper third → Stronger legs; middle → nothing", () => {
    expect(suggestGoalFromDsi(player(0.72), squad, today)?.goal).toBe("power");
    expect(suggestGoalFromDsi(player(0.93), squad, today)?.goal).toBe("stronger");
    expect(suggestGoalFromDsi(player(0.83), squad, today)).toBeNull();
  });

  it("never suggests Stronger hamstrings", () => {
    for (let r = 0.5; r <= 1.2; r += 0.01) expect(suggestGoalFromDsi(player(r), squad, today)?.goal).not.toBe("robust");
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
    expect(suggestGoalFromDsi(player(0.72, { cmjTestDate: "2025-11-17" }), squad, today)?.goal).toBe("power"); // exactly 365 days
  });
});

describe("wiring", () => {
  const root = join(__dirname, "..", "..", "..", "..", "..");
  const read = (p: string) => readFileSync(join(root, p), "utf8");

  it("both picks routes return the suggestion and keep what was suggested in the goal's history", () => {
    const player = read("src/app/api/player/strength-picks/route.ts");
    expect(player).toMatch(/loadDsiGoalSuggestions/);
    expect(player).toMatch(/dsiSuggested: suggestion\?\.goal \?\? null/);
    const coach = read("src/app/api/coach/team/player-strength-picks/route.ts");
    expect(coach).toMatch(/suggestion: suggestions\.get\(p\.id\) \?\? null/);
    expect(coach).toMatch(/dsiSuggested: suggested/);
    const store = read("src/lib/micropulse/strengthProgramming/playerPicksStore.ts");
    expect(store).toMatch(/after: \{ goal: args\.goal, dsiSuggested: args\.dsiSuggested \?\? null \}/);
  });

  it("the suggestion never decides the goal: the player's save takes the goal from the body only", () => {
    const player = read("src/app/api/player/strength-picks/route.ts");
    expect(player).toMatch(/goal: g\.goal/);
    expect(player).not.toMatch(/goal: suggestion/);
  });
});
