import { describe, it, expect } from "vitest";
import { matchEliteRoute, eliteFeatureForHref, pathMatchesPrefix } from "../routeGating";
import { hasFeature } from "../hasFeature";
import { FEATURE_MIN_PLAN } from "../features";

describe("matchEliteRoute", () => {
  it("maps opposition/match analytics pages", () => {
    for (const p of ["/coach/match-analysis", "/coach/match-insights", "/coach/best-matches", "/coach/opponent-scouting"]) {
      expect(matchEliteRoute(p)?.feature).toBe("OPPOSITION_MATCH_ANALYTICS");
    }
  });
  it("maps player season analytics pages", () => {
    for (const p of ["/coach/stat-explorer", "/coach/player-analysis", "/coach/player-stats", "/coach/total-player-analysis", "/coach/transfer-report", "/coach/form-vs-state"]) {
      expect(matchEliteRoute(p)?.feature).toBe("PLAYER_SEASON_ANALYTICS");
    }
  });
  it("maps deep VALD pages, including dynamic /coach/rtp/[playerId] by prefix", () => {
    expect(matchEliteRoute("/coach/assessments")?.feature).toBe("VALD_ASSESSMENT_SUITE");
    expect(matchEliteRoute("/coach/lv-profile")?.feature).toBe("VALD_ASSESSMENT_SUITE");
    expect(matchEliteRoute("/coach/rtp")?.feature).toBe("VALD_ASSESSMENT_SUITE");
    expect(matchEliteRoute("/coach/rtp/6429def5-7816-47c3-bbd5-47b2fe822602")?.feature).toBe("VALD_ASSESSMENT_SUITE");
  });
  it("does NOT gate excluded / ungated routes", () => {
    for (const p of ["/coach", "/coach/win-factors", "/coach/game-plan-fit", "/coach/readiness-signals", "/coach/reporting-center", "/coach/strength", "/coach/players", null, undefined, ""]) {
      expect(matchEliteRoute(p)).toBeNull();
    }
  });
  it("respects segment boundaries — a sibling prefix is not a match", () => {
    // "/coach/match-analysis-x" must NOT be caught by the "/coach/match-analysis" rule.
    expect(matchEliteRoute("/coach/match-analysis-extra")).toBeNull();
    expect(pathMatchesPrefix("/coach/rtp-log", "/coach/rtp")).toBe(false);
    expect(pathMatchesPrefix("/coach/rtp/abc", "/coach/rtp")).toBe(true);
    expect(pathMatchesPrefix("/coach/rtp", "/coach/rtp")).toBe(true);
  });
  it("eliteFeatureForHref mirrors matchEliteRoute for sidebar hrefs", () => {
    expect(eliteFeatureForHref("/coach/form-vs-state")).toBe("PLAYER_SEASON_ANALYTICS");
    expect(eliteFeatureForHref("/coach/strength")).toBeNull();
  });
});

describe("new ELITE feature keys — plan gating", () => {
  const KEYS = ["OPPOSITION_MATCH_ANALYTICS", "PLAYER_SEASON_ANALYTICS", "VALD_ASSESSMENT_SUITE"] as const;

  it("are ELITE-minimum", () => {
    for (const k of KEYS) expect(FEATURE_MIN_PLAN[k]).toBe("ELITE");
  });
  it("are denied to FREE / LITE / PRO and allowed for ELITE", () => {
    for (const k of KEYS) {
      expect(hasFeature("FREE", k)).toBe(false);
      expect(hasFeature("LITE", k)).toBe(false);
      expect(hasFeature("PRO", k)).toBe(false);
      expect(hasFeature("ELITE", k)).toBe(true);
    }
  });
  it("does not disturb CMJ monitoring — still LITE+ (decision: CMJ stays)", () => {
    expect(FEATURE_MIN_PLAN.VALD_CMJ_MONITORING).toBe("LITE");
    expect(hasFeature("LITE", "VALD_CMJ_MONITORING")).toBe(true);
    expect(hasFeature("PRO", "VALD_CMJ_MONITORING")).toBe(true);
    expect(hasFeature("FREE", "VALD_CMJ_MONITORING")).toBe(false);
  });
});
