import { describe, it, expect } from "vitest";
import {
  chaosLevelFromIndex, effectiveChaosLevel, summarizeChaosExposure,
  CHAOS_INDEX_BANDS, type ChaosSession,
} from "../chaos";

const session = (over: Partial<ChaosSession>): ChaosSession => ({
  date: "2026-10-10", source: "catapult", distanceM: 3000,
  effortsHi: 12, effortsPerKm: 4.0, chaosIndexPct: 0.3, suggestedLevel: null,
  confirmedLevel: null, cognitiveLevel: null, note: null, ...over,
});

describe("chaosLevelFromIndex", () => {
  it("maps the % of own-game CoD density onto the escalating bands", () => {
    expect(chaosLevelFromIndex(0)).toBe("high_control");
    expect(chaosLevelFromIndex(0.1)).toBe("high_control");
    expect(chaosLevelFromIndex(0.2)).toBe("moderate_control");
    expect(chaosLevelFromIndex(0.5)).toBe("moderate_chaos");
    expect(chaosLevelFromIndex(0.8)).toBe("high_chaos");
    expect(chaosLevelFromIndex(1.0)).toBe("team_training");
    expect(chaosLevelFromIndex(1.4)).toBe("team_training");
  });
  it("returns null for a missing / invalid index (no GPS, no baseline)", () => {
    expect(chaosLevelFromIndex(null)).toBeNull();
    expect(chaosLevelFromIndex(Number.NaN)).toBeNull();
    expect(chaosLevelFromIndex(-1)).toBeNull();
  });
  it("band table is contiguous and covers 0→open", () => {
    expect(CHAOS_INDEX_BANDS[0].low).toBe(0);
    expect(CHAOS_INDEX_BANDS[CHAOS_INDEX_BANDS.length - 1].high).toBeNull();
    for (let i = 1; i < CHAOS_INDEX_BANDS.length; i++) {
      expect(CHAOS_INDEX_BANDS[i].low).toBe(CHAOS_INDEX_BANDS[i - 1].high);
    }
  });
});

describe("effectiveChaosLevel", () => {
  it("the physio's confirmation wins over the proxy suggestion", () => {
    expect(effectiveChaosLevel(session({ suggestedLevel: "high_control", confirmedLevel: "moderate_chaos" }))).toBe("moderate_chaos");
    expect(effectiveChaosLevel(session({ suggestedLevel: "high_control", confirmedLevel: null }))).toBe("high_control");
    expect(effectiveChaosLevel(session({ suggestedLevel: null, confirmedLevel: null }))).toBeNull();
  });
});

describe("summarizeChaosExposure", () => {
  it("exposureMet=false when recent sessions are all more linear than the phase", () => {
    const r = summarizeChaosExposure(
      [session({ suggestedLevel: "high_control" }), session({ suggestedLevel: "moderate_control" })],
      "moderate_chaos",
    );
    expect(r.exposureMet).toBe(false);
    expect(r.evaluated).toBe(2);
    expect(r.summary.en).toMatch(/No chaos exposure yet/i);
  });
  it("exposureMet=true when ≥1 session reaches the phase's chaos order", () => {
    const r = summarizeChaosExposure(
      [session({ suggestedLevel: "high_control" }), session({ confirmedLevel: "high_chaos" })],
      "moderate_chaos",
    );
    expect(r.exposureMet).toBe(true);
    expect(r.counts.high_chaos).toBe(1);
    expect(r.summary.en).toMatch(/exposure met/i);
  });
  it("High Control needs no chaos — any tagged session reads as met-equivalent wording", () => {
    const r = summarizeChaosExposure([session({ suggestedLevel: "high_control" })], "high_control");
    expect(r.exposureMet).toBe(true); // order 0 ≥ 0
    expect(r.summary.en).toMatch(/planned, linear/i);
  });
  it("no evaluable sessions → a prompt to tag", () => {
    const r = summarizeChaosExposure([session({ suggestedLevel: null, confirmedLevel: null })], "moderate_chaos");
    expect(r.evaluated).toBe(0);
    expect(r.summary.en).toMatch(/No tagged sessions yet/i);
  });
});
