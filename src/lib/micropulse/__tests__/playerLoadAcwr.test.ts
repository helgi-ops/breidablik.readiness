/**
 * Tests for playerLoadAcwr.
 *
 * Run with:  npx vitest src/lib/micropulse/__tests__/playerLoadAcwr.test.ts
 */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { describe, it, expect } from "vitest";
import {
  bandFromRatio,
  buildAcwrDriverFlag,
  computePlayerLoadAcwr,
  formatAcwrReason,
  type DailyLoad,
} from "../playerLoadAcwr";

const TODAY = "2026-05-09";

function dailySeries(values: Array<number | null>, endIso: string): DailyLoad[] {
  // values[0] is OLDEST, values[N-1] is endIso (today).
  const end = new Date(`${endIso}T00:00:00Z`);
  const out: DailyLoad[] = [];
  values.forEach((v, i) => {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - (values.length - 1 - i));
    out.push({ date: d.toISOString().slice(0, 10), load: v });
  });
  return out;
}

describe("bandFromRatio", () => {
  it("classifies bands by Gabbett 2016 thresholds", () => {
    expect(bandFromRatio(null)).toBe("INSUFFICIENT_DATA");
    expect(bandFromRatio(0.5)).toBe("UNDERTRAIN");
    expect(bandFromRatio(0.79)).toBe("UNDERTRAIN");
    expect(bandFromRatio(0.8)).toBe("SAFE");
    expect(bandFromRatio(1.0)).toBe("SAFE");
    expect(bandFromRatio(1.3)).toBe("SAFE");
    expect(bandFromRatio(1.31)).toBe("WATCH");
    expect(bandFromRatio(1.5)).toBe("WATCH");
    expect(bandFromRatio(1.51)).toBe("RISK");
    expect(bandFromRatio(2.5)).toBe("RISK");
  });
});

describe("computePlayerLoadAcwr", () => {
  it("returns INSUFFICIENT_DATA when fewer than 8 sessions in window", () => {
    // Only 5 days have data
    const rows = dailySeries(
      [null, null, null, null, null, null, null, null, null, null,
       null, null, null, null, null, null, null, null, null, null,
       null, null, null, 100, 100, 100, 100, 100],
      TODAY,
    );
    const out = computePlayerLoadAcwr(rows, TODAY);
    expect(out.band).toBe("INSUFFICIENT_DATA");
    expect(out.daysObserved).toBe(5);
    expect(out.ratio).toBeNull();
  });

  it("returns SAFE for steady weekly load", () => {
    // 28 days, ~400 PL per day every weekday, rest on weekends.
    const series: Array<number | null> = [];
    for (let i = 0; i < 28; i += 1) {
      const dow = i % 7;
      series.push(dow === 5 || dow === 6 ? 0 : 400);
    }
    const out = computePlayerLoadAcwr(dailySeries(series, TODAY), TODAY);
    expect(out.band).toBe("SAFE");
    // Acute mean and chronic mean are similar → ratio ~1.0
    expect(out.ratio).toBeGreaterThan(0.85);
    expect(out.ratio).toBeLessThan(1.15);
  });

  it("flags RISK when last 7 days are way above 28-day baseline", () => {
    // 21 days of 100 PL, then 7 days of 600 PL (6× spike)
    const series: Array<number | null> = [];
    for (let i = 0; i < 21; i += 1) series.push(100);
    for (let i = 0; i < 7; i += 1) series.push(600);
    const out = computePlayerLoadAcwr(dailySeries(series, TODAY), TODAY);
    expect(out.band).toBe("RISK");
    expect(out.ratio).toBeGreaterThan(1.5);
  });

  it("flags UNDERTRAIN when last 7 days drop way below baseline", () => {
    // 21 days of 600, then 7 days of 50 (taper / detraining)
    const series: Array<number | null> = [];
    for (let i = 0; i < 21; i += 1) series.push(600);
    for (let i = 0; i < 7; i += 1) series.push(50);
    const out = computePlayerLoadAcwr(dailySeries(series, TODAY), TODAY);
    expect(out.band).toBe("UNDERTRAIN");
    expect(out.ratio).toBeLessThan(0.8);
  });

  it("treats missing days as zero (rest)", () => {
    // Only 10 days of 500, rest are null. Should still compute (>= 8 obs).
    const series: Array<number | null> = new Array(28).fill(null);
    for (let i = 18; i < 28; i += 1) series[i] = 500;
    const out = computePlayerLoadAcwr(dailySeries(series, TODAY), TODAY);
    expect(out.daysObserved).toBe(10);
    expect(out.acuteMean).not.toBeNull();
    expect(out.chronicMean).not.toBeNull();
    // Acute window is fully loaded (7 days of 500 = 500 mean), chronic is 10 days * 500 / 28 = 178.6
    // Ratio ~2.8 → RISK
    expect(out.band).toBe("RISK");
  });
});

describe("buildAcwrDriverFlag", () => {
  it("returns null for SAFE", () => {
    expect(
      buildAcwrDriverFlag({
        acuteMean: 400,
        chronicMean: 400,
        ratio: 1.0,
        band: "SAFE",
        daysObserved: 20,
      }),
    ).toBeNull();
  });

  it("returns null for UNDERTRAIN (informational only)", () => {
    expect(
      buildAcwrDriverFlag({
        acuteMean: 200,
        chronicMean: 400,
        ratio: 0.5,
        band: "UNDERTRAIN",
        daysObserved: 20,
      }),
    ).toBeNull();
  });

  it("returns watch for ratio in WATCH band", () => {
    const flag = buildAcwrDriverFlag({
      acuteMean: 560,
      chronicMean: 400,
      ratio: 1.4,
      band: "WATCH",
      daysObserved: 20,
    });
    expect(flag).not.toBeNull();
    expect(flag?.severity).toBe("watch");
  });

  it("returns concern for ratio 1.5–1.8", () => {
    const flag = buildAcwrDriverFlag({
      acuteMean: 700,
      chronicMean: 400,
      ratio: 1.75,
      band: "RISK",
      daysObserved: 20,
    });
    expect(flag?.severity).toBe("concern");
  });

  it("returns high for ratio >= 1.8", () => {
    const flag = buildAcwrDriverFlag({
      acuteMean: 800,
      chronicMean: 400,
      ratio: 2.0,
      band: "RISK",
      daysObserved: 20,
    });
    expect(flag?.severity).toBe("high");
  });
});

describe("formatAcwrReason", () => {
  it("formats high-severity reason", () => {
    const r = formatAcwrReason({
      driver: "PLAYER_LOAD_ACWR",
      ratio: 2.1,
      band: "RISK",
      acuteMean: 840,
      chronicMean: 400,
      severity: "high",
    });
    expect(r).toContain("2.10");
    expect(r).toContain("840");
    expect(r).toContain("400");
    // High severity is conveyed in plain language (explainability-first), not the
    // jargon "high-risk" — the reason string was rewritten for coach-readability.
    expect(r).toContain("sharp load spike");
  });
});
