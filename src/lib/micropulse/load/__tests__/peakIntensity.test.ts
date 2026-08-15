import { describe, it, expect } from "vitest";
import {
  computePeakIntensity,
  proxiesFor,
  worstCaseSession,
  PEAK_LEVEL_BAND,
  PEAK_OUTLIER_BAND,
  type PeakRow,
} from "../peakIntensity";

// Baseline session: load/min 10, peak metab 45, HSR band6 300m/80min=3.75/min, efforts 60/80=0.75/min.
const baseRow = (date: string, over: Partial<PeakRow> = {}): PeakRow => ({
  date,
  loadPerMin: 10,
  metabolicPeak: 45,
  hsrBand6: 300,
  accelEfforts: 30,
  decelEfforts: 30,
  durationMin: 80,
  ...over,
});

describe("proxiesFor", () => {
  it("computes the four proxies with per-minute normalisation", () => {
    const p = proxiesFor(baseRow("2026-07-01"));
    expect(p.loadPerMin).toBe(10);
    expect(p.metabolicPeak).toBe(45);
    expect(p.hsrRate).toBeCloseTo(300 / 80, 5);
    expect(p.effortsPerMin).toBeCloseTo(60 / 80, 5);
  });

  it("nulls the per-minute proxies without a duration, keeps duration-free ones", () => {
    const p = proxiesFor(baseRow("2026-07-01", { durationMin: null }));
    expect(p.loadPerMin).toBe(10); // already per-minute, no duration needed
    expect(p.metabolicPeak).toBe(45);
    expect(p.hsrRate).toBeNull();
    expect(p.effortsPerMin).toBeNull();
  });

  it("efforts proxy is null only when BOTH accel and decel are absent", () => {
    expect(proxiesFor(baseRow("2026-07-01", { accelEfforts: null, decelEfforts: null })).effortsPerMin).toBeNull();
    expect(proxiesFor(baseRow("2026-07-01", { accelEfforts: null })).effortsPerMin).toBeCloseTo(30 / 80, 5);
  });

  it("derives minutes from PlayerLoad ÷ load/min for the per-minute proxies", () => {
    // durationMin null, playerLoad 400 ÷ loadPerMin 10 = 40 min → HSR 300/40, efforts 60/40.
    const p = proxiesFor(baseRow("2026-07-01", { durationMin: null, playerLoad: 400 }));
    expect(p.hsrRate).toBeCloseTo(300 / 40, 5);
    expect(p.effortsPerMin).toBeCloseTo(60 / 40, 5);
    expect(p.loadPerMin).toBe(10); // unchanged
  });
});

describe("computePeakIntensity", () => {
  it("flags the most intense session as PEAK and finds it as worst-case", () => {
    const rows: PeakRow[] = [
      baseRow("2026-07-01"),
      baseRow("2026-07-02"),
      baseRow("2026-07-03"),
      baseRow("2026-07-04"),
      // Everything ~doubled → fingerprint well past +50.
      baseRow("2026-07-05", { loadPerMin: 20, metabolicPeak: 90, hsrBand6: 600, accelEfforts: 60, decelEfforts: 60 }),
    ];
    const read = computePeakIntensity(rows);
    expect(read.latest?.level).toBe("peak");
    expect(read.latest?.fingerprint ?? 0).toBeGreaterThan(100 + PEAK_OUTLIER_BAND);
    expect(read.worstCase?.date).toBe("2026-07-05");
    expect(worstCaseSession(rows)?.date).toBe("2026-07-05");
  });

  it("labels an elevated (not outlier) session as elevated", () => {
    const rows: PeakRow[] = [
      baseRow("2026-07-01"),
      baseRow("2026-07-02"),
      baseRow("2026-07-03"),
      baseRow("2026-07-04"),
      // ~+35% across proxies → past +25 band, under +50 outlier.
      baseRow("2026-07-05", { loadPerMin: 13.5, metabolicPeak: 61, hsrBand6: 405, accelEfforts: 40, decelEfforts: 41 }),
    ];
    const read = computePeakIntensity(rows);
    const s = read.history.find((h) => h.date === "2026-07-05");
    expect(s?.level).toBe("elevated");
    expect(s?.fingerprint ?? 0).toBeGreaterThan(100 + PEAK_LEVEL_BAND);
    expect(s?.fingerprint ?? 0).toBeLessThan(100 + PEAK_OUTLIER_BAND);
  });

  it("stays insufficient until the baseline is mature", () => {
    const read = computePeakIntensity([baseRow("2026-07-01"), baseRow("2026-07-02")]);
    expect(read.latest?.level).toBe("insufficient");
    expect(read.confidence).toBe("low");
  });

  it("composite fingerprint averages only the proxies that are present", () => {
    // Only loadPerMin present across the window → fingerprint = its own index, others null.
    const rows: PeakRow[] = Array.from({ length: 5 }, (_, i) =>
      baseRow(`2026-07-0${i + 1}`, {
        metabolicPeak: null,
        hsrBand6: null,
        accelEfforts: null,
        decelEfforts: null,
        loadPerMin: i === 4 ? 20 : 10,
      }),
    );
    const read = computePeakIntensity(rows);
    expect(read.dataCoverage.proxies).toBe(1);
    expect(read.latest?.indices.metabolicPeak).toBeNull();
    expect(read.latest?.fingerprint).toBe(read.latest?.indices.loadPerMin);
    // Single proxy → confidence can't reach high (needs ≥3 proxies).
    expect(read.confidence).toBe("low");
  });

  it("excludes sub-20-min sessions (inflated per-minute rate) from the peak read", () => {
    const rows: PeakRow[] = [
      baseRow("2026-07-01"),
      baseRow("2026-07-02"),
      baseRow("2026-07-03"),
      // A 15-min warmup with a wildly inflated load rate — must NOT become the worst-case.
      baseRow("2026-07-04", { durationMin: 15, loadPerMin: 40 }),
    ];
    const read = computePeakIntensity(rows);
    expect(read.dataCoverage.sessions).toBe(3); // the 15-min block dropped
    expect(read.worstCase?.date).not.toBe("2026-07-04");
    expect(read.ceiling ?? 0).toBeLessThan(40); // the 40 outlier never reaches the ceiling
  });

  it("ceiling is the p90 of PlayerLoad/min over qualifying sessions (outlier-resistant)", () => {
    const rows: PeakRow[] = [
      baseRow("2026-07-01", { loadPerMin: 10 }),
      baseRow("2026-07-02", { loadPerMin: 10 }),
      baseRow("2026-07-03", { loadPerMin: 11 }),
      baseRow("2026-07-04", { loadPerMin: 12 }),
      baseRow("2026-07-05", { durationMin: 12, loadPerMin: 50 }), // short → excluded
    ];
    const read = computePeakIntensity(rows);
    expect(read.ceiling ?? 0).toBeGreaterThan(10);
    expect(read.ceiling ?? 0).toBeLessThan(13); // nowhere near the 50 outlier
  });
});
