/**
 * Tests for recoveryWatch — the day-aware post-match recovery loop
 * (docs/post-match-recovery-recheck.md, step 1).
 *
 * Run:  npx vitest src/lib/micropulse/__tests__/recoveryWatch.test.ts
 */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { describe, it, expect } from "vitest";
import { recoveryWatch, parseMdOffset } from "../recoveryWatch";
import type { AthleteMetricBaseline } from "../baselines";

// readiness wellness.total, mean 20, sd 2 → 1 SD = 2 points.
const base = (status = "active"): AthleteMetricBaseline => ({
  player_id: "p1", metric_key: "wellness.total", n_observations: 28,
  mean: 20, sd: 2, cv: 0.1, median: 20, window_days: 28, status, computed_at: "2026-06-23",
});

const inp = (over) => ({ minutesPlayed: 90, mdDay: "MD+2", todayReadiness: 20, baseline: base(), ...over });

describe("parseMdOffset", () => {
  it("parses MD+N (and tolerates spacing)", () => {
    expect(parseMdOffset("MD+1")).toBe(1);
    expect(parseMdOffset("md + 3")).toBe(3);
    expect(parseMdOffset(null)).toBeNull();
    expect(parseMdOffset("REST")).toBeNull();
  });
});

describe("recoveryWatch — gating", () => {
  it("na when minutes below threshold", () => {
    expect(recoveryWatch(inp({ minutesPlayed: 10 })).status).toBe("na");
  });
  it("na when no MD-day", () => {
    expect(recoveryWatch(inp({ mdDay: null })).status).toBe("na");
  });
  it("na when no reading", () => {
    expect(recoveryWatch(inp({ todayReadiness: null })).status).toBe("na");
  });
  it("building (never flags) when baseline immature", () => {
    const r = recoveryWatch(inp({ baseline: base("insufficient_data") }));
    expect(r.status).toBe("building");
    expect(r.recheck).toBe(false);
  });
});

describe("recoveryWatch — MD+1 is lenient (echo expected)", () => {
  it("low-but-expected → on_track, re-checks, does NOT alert", () => {
    // 18.5 → z −0.75, belowBy 0.75 < 1.5 bar
    const r = recoveryWatch(inp({ mdDay: "MD+1", todayReadiness: 18.5 }));
    expect(r.status).toBe("on_track");
    expect(r.recheck).toBe(true);
  });
  it("FAR below the echo → monitor", () => {
    // 17 → z −1.5, belowBy 1.5 ≥ 1.5 bar
    const r = recoveryWatch(inp({ mdDay: "MD+1", todayReadiness: 17 }));
    expect(r.status).toBe("monitor");
    expect(r.recheck).toBe(true);
  });
  it("expectedMd1Dip steepens the bar (a known big echo is not flagged)", () => {
    // expected dip 1.4 → bar 1.9; today belowBy 1.5 < 1.9 → on_track
    const r = recoveryWatch(inp({ mdDay: "MD+1", todayReadiness: 17, expectedMd1Dip: 1.4 }));
    expect(r.status).toBe("on_track");
  });
});

describe("recoveryWatch — MD+2 should be returning", () => {
  it("at baseline → recovered, closes the watch", () => {
    const r = recoveryWatch(inp({ mdDay: "MD+2", todayReadiness: 20 }));
    expect(r.status).toBe("recovered");
    expect(r.recheck).toBe(false);
  });
  it("still ≥1 SD below → incomplete, re-checks", () => {
    const r = recoveryWatch(inp({ mdDay: "MD+2", todayReadiness: 18 })); // z −1
    expect(r.status).toBe("incomplete");
    expect(r.recheck).toBe(true);
    expect(r.belowBy).toBe(1);
  });
});

describe("recoveryWatch — MD+3+ should be back (else escalate)", () => {
  it("still below → escalate", () => {
    const r = recoveryWatch(inp({ mdDay: "MD+3", todayReadiness: 18 }));
    expect(r.status).toBe("escalate");
    expect(r.recheck).toBe(true);
  });
  it("recovered → close", () => {
    const r = recoveryWatch(inp({ mdDay: "MD+3", todayReadiness: 20.5 }));
    expect(r.status).toBe("recovered");
  });
});

describe("recoveryWatch — a player above baseline never flags", () => {
  it("above baseline at MD+2 → recovered", () => {
    const r = recoveryWatch(inp({ mdDay: "MD+2", todayReadiness: 23 }));
    expect(r.status).toBe("recovered");
    expect(r.belowBy).toBe(0);
  });
});
