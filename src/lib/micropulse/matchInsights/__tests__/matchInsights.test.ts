import { describe, it, expect } from "vitest";
import { pearson, MIN_CORRELATION_N } from "../correlation";
import { winLossMovement } from "../winLoss";
import type { MatchMetricRow } from "../winLoss";
import { extendedMetricsForRow } from "../extendedMetrics";
import { buildMatchNarrative } from "../narrative";
import type { WinLossResult } from "../winLoss";
import { firstHalfSeries, teamFirstHalfSeries, type HalfPeriodRow } from "../../matchIntensityHalves";

describe("pearson correlation", () => {
  it("returns a strong positive r for a rising pair", () => {
    const r = pearson([1, 2, 3, 4, 5], [2, 4, 6, 8, 10])!;
    expect(r.r).toBeCloseTo(1, 5);
    expect(r.direction).toBe("positive");
    expect(r.strength).toBe("strong");
    expect(r.n).toBe(5);
  });

  it("returns a negative r for an inverse pair", () => {
    const r = pearson([1, 2, 3, 4, 5], [10, 8, 6, 4, 2])!;
    expect(r.r).toBeCloseTo(-1, 5);
    expect(r.direction).toBe("negative");
  });

  it("drops null pairs and honours the min-n gate", () => {
    // Only 4 valid pairs after dropping nulls → below MIN_CORRELATION_N → null.
    expect(MIN_CORRELATION_N).toBe(5);
    expect(pearson([1, 2, 3, 4, null], [1, 2, 3, 4, 9])).toBeNull();
  });

  it("zero-variance series → null (no fabricated r)", () => {
    expect(pearson([5, 5, 5, 5, 5], [1, 2, 3, 4, 5])).toBeNull();
  });
});

describe("winLossMovement", () => {
  const rows: MatchMetricRow[] = [
    { sessionDate: "2026-05-01", result: "W", values: { sprint: 30, decel: 10 } },
    { sessionDate: "2026-05-08", result: "W", values: { sprint: 34, decel: 11 } },
    { sessionDate: "2026-05-15", result: "W", values: { sprint: 32, decel: 9 } },
    { sessionDate: "2026-05-22", result: "L", values: { sprint: 22, decel: 10 } },
    { sessionDate: "2026-05-29", result: "L", values: { sprint: 20, decel: 11 } },
    { sessionDate: "2026-06-05", result: "L", values: { sprint: 24, decel: 9 } },
    { sessionDate: "2026-06-12", result: "D", values: { sprint: 27, decel: 10 } },
  ];

  it("flags a metric that clearly separates wins from losses with a large d", () => {
    const res = winLossMovement(rows, ["sprint", "decel"]);
    expect(res.confident).toBe(true); // 3 W, 3 L
    // sprint (higher in wins) should rank first with a big positive d.
    expect(res.metrics[0].metric).toBe("sprint");
    expect(res.metrics[0].cohenD!).toBeGreaterThan(1.5);
    expect(res.metrics[0].deltaPct!).toBeGreaterThan(0);
    // decel barely differs → small |d|, sorts last.
    expect(Math.abs(res.metrics[1].cohenD ?? 0)).toBeLessThan(0.5);
  });

  it("is not confident when a result group is too small", () => {
    const res = winLossMovement(rows.slice(0, 4), ["sprint"]); // 3 W, 1 L
    expect(res.confident).toBe(false);
    expect(res.metrics[0].cohenD).toBeNull(); // <2 losses → no effect size
  });
});

describe("extendedMetricsForRow", () => {
  it("computes per-minute GPS + detailed-IMA metrics, high-CoD summed L+R", () => {
    const row = {
      total_distance: 9000, high_speed_distance: 540, velocity_band6_total_distance: 180,
      max_velocity: 31, high_metabolic_load_distance_m: 900, ima_band3_decel_count: 18,
      ima_cod_left_high: 6, ima_cod_right_high: 3, ima_fr_band8_stride_count: 45,
      fmp_running_high_s: 300, fmp_total_duration_s: 6000, jumps: 9,
    };
    const m = extendedMetricsForRow(row, 90);
    expect(m.totalDistPerMin).toBeCloseTo(100, 5);
    expect(m.hsrPerMin).toBeCloseTo(6, 5);
    expect(m.sprintPerMin).toBeCloseTo(2, 5);
    expect(m.maxVel).toBe(31);
    expect(m.codHighPerMin).toBeCloseTo(9 / 90, 5); // (6+3)/90
    expect(m.fmpHighRunPct).toBeCloseTo(5, 5); // 300/6000*100
    expect(m.jumpsPerMin).toBeCloseTo(0.1, 5);
  });

  it("nulls absent sources and drops a >45 km/h max-velocity glitch (no fabricated 0)", () => {
    const m = extendedMetricsForRow({ max_velocity: 88, high_speed_distance: null }, 90);
    expect(m.maxVel).toBeNull();
    expect(m.hsrPerMin).toBeNull();
    expect(m.codHighPerMin).toBeNull(); // no L/R high fields present
  });
});

describe("buildMatchNarrative", () => {
  const label = (k: string) => k; // identity labeller for tests

  const confidentWinLoss: WinLossResult = {
    nWin: 3, nDraw: 1, nLoss: 3, confident: true,
    metrics: [
      { metric: "sprint", win: { n: 3, mean: 32, sd: 2 }, loss: { n: 3, mean: 22, sd: 2 }, draw: { n: 1, mean: 27, sd: null }, cohenD: 1.6, deltaPct: 45 },
      { metric: "codHigh", win: { n: 3, mean: 4, sd: 1 }, loss: { n: 3, mean: 6, sd: 1 }, draw: { n: 1, mean: 5, sd: null }, cohenD: -0.9, deltaPct: -33 },
      { metric: "pl", win: { n: 3, mean: 7, sd: 1 }, loss: { n: 3, mean: 7.1, sd: 1 }, draw: { n: 1, mean: 7, sd: null }, cohenD: 0.1, deltaPct: -1 },
    ],
  };

  it("headline states the sample and points cite d / direction; small d is dropped", () => {
    const n = buildMatchNarrative({
      lang: "EN", label, winLoss: confidentWinLoss,
      resultCorrelations: [], seasonXg: { available: false, correlations: [] }, firstHalf: null,
    });
    expect(n.headline).toContain("3 W");
    expect(n.headline).toContain("3 L");
    expect(n.headline).not.toContain("small sample"); // confident
    const body = n.points.map((p) => p.text).join(" | ");
    expect(body).toContain("sprint"); // |d|=1.6 → called out
    expect(body).toContain("d=1.60");
    expect(body).toContain("higher in wins");
    expect(body).toContain("codHigh"); // |d|=0.9 → called out, higher in losses
    expect(body).not.toContain("pl"); // |d|=0.1 → below the 0.5 floor, dropped
    // Always closes with a caveat point.
    expect(n.points[n.points.length - 1].tone).toBe("caveat");
  });

  it("flags a tentative read when the sample is not confident", () => {
    const n = buildMatchNarrative({
      lang: "EN", label,
      winLoss: { ...confidentWinLoss, nWin: 2, nLoss: 1, confident: false },
      resultCorrelations: [], seasonXg: { available: false, correlations: [] }, firstHalf: null,
    });
    expect(n.headline).toContain("small sample");
    expect(n.points.some((p) => p.text.startsWith("Early signal:"))).toBe(true);
  });

  it("calls out a first-half swing above the threshold, else says 'in line'", () => {
    const swing = buildMatchNarrative({
      lang: "EN", label, winLoss: null,
      resultCorrelations: [], seasonXg: { available: false, correlations: [] },
      firstHalf: { latestDate: "2026-05-15", compares: [
        { key: "hsr", latest: 6, priorMean: 5, z: 1.4, deltaPct: 20, nPrior: 4 },
        { key: "high", latest: 3, priorMean: 2.95, z: 0.1, deltaPct: 1.7, nPrior: 4 },
      ] },
    });
    expect(swing.points.some((p) => p.text.includes("+20.0%") && p.text.includes("hsr"))).toBe(true);

    const flat = buildMatchNarrative({
      lang: "EN", label, winLoss: null,
      resultCorrelations: [], seasonXg: { available: false, correlations: [] },
      firstHalf: { latestDate: "2026-05-15", compares: [
        { key: "high", latest: 3, priorMean: 2.98, z: 0.1, deltaPct: 0.7, nPrior: 4 },
      ] },
    });
    expect(flat.points.some((p) => p.text.includes("in line with prior matches"))).toBe(true);
  });

  it("only surfaces a result correlation once it clears the n floor", () => {
    const belowFloor = buildMatchNarrative({
      lang: "EN", label, winLoss: confidentWinLoss,
      resultCorrelations: [{ key: "sprint", r: 0.9, n: 7, strength: "strong", direction: "positive" }],
      seasonXg: { available: false, correlations: [] }, firstHalf: null,
    });
    expect(belowFloor.points.some((p) => p.text.includes("r=0.90"))).toBe(false);
    expect(belowFloor.points.some((p) => p.text.includes("too small-sample"))).toBe(true);

    const clears = buildMatchNarrative({
      lang: "EN", label, winLoss: confidentWinLoss,
      resultCorrelations: [{ key: "sprint", r: 0.6, n: 12, strength: "strong", direction: "positive" }],
      seasonXg: { available: false, correlations: [] }, firstHalf: null,
    });
    expect(clears.points.some((p) => p.text.includes("r=0.60") && p.text.includes("n=12"))).toBe(true);
  });

  it("Icelandic renders (headline + caveat) without leaking English", () => {
    const n = buildMatchNarrative({
      lang: "IS", label, winLoss: confidentWinLoss,
      resultCorrelations: [], seasonXg: { available: false, correlations: [] }, firstHalf: null,
    });
    expect(n.headline).toContain("metnum");
    expect(n.points[n.points.length - 1].text).toContain("readiness-dómnum");
  });
});

describe("firstHalfSeries / teamFirstHalfSeries", () => {
  // Two players, three match dates, first-half rows only (+ a 2nd-half + a short
  // one that must be ignored).
  const rows: HalfPeriodRow[] = [
    { playerId: "p1", playerName: "Ari", sessionDate: "2026-05-01", half: 1, durationMin: 45, highIma: 90, imaAccel: 40, imaDecel: 40, imaCodTotal: 20, hirTotal: 450, playerLoadPerMin: 6 },
    { playerId: "p1", playerName: "Ari", sessionDate: "2026-05-08", half: 1, durationMin: 45, highIma: 99, imaAccel: 44, imaDecel: 44, imaCodTotal: 22, hirTotal: 495, playerLoadPerMin: 6.6 },
    { playerId: "p1", playerName: "Ari", sessionDate: "2026-05-15", half: 1, durationMin: 45, highIma: 135, imaAccel: 60, imaDecel: 60, imaCodTotal: 30, hirTotal: 675, playerLoadPerMin: 9 }, // latest — big jump
    { playerId: "p1", playerName: "Ari", sessionDate: "2026-05-15", half: 2, durationMin: 45, highIma: 80, imaAccel: 35, imaDecel: 35, imaCodTotal: 20, hirTotal: 400, playerLoadPerMin: 5 }, // 2nd half ignored
    { playerId: "p1", playerName: "Ari", sessionDate: "2026-04-24", half: 1, durationMin: 10, highIma: 20, imaAccel: 8, imaDecel: 8, imaCodTotal: 4, hirTotal: 100, playerLoadPerMin: 5 }, // short → ignored
    { playerId: "p2", playerName: "Bjarni", sessionDate: "2026-05-15", half: 1, durationMin: 45, highIma: 90, imaAccel: 40, imaDecel: 40, imaCodTotal: 20, hirTotal: 450, playerLoadPerMin: 6 },
  ];

  it("builds a per-player first-half series (newest first), ignoring 2nd/short halves", () => {
    const s = firstHalfSeries(rows);
    const ari = s.find((p) => p.playerId === "p1")!;
    expect(ari.matches.map((m) => m.sessionDate)).toEqual(["2026-05-15", "2026-05-08", "2026-05-01"]);
    expect(ari.latestDate).toBe("2026-05-15");
    // high/min latest = 135/45 = 3.0; prior mean = (2.0 + 2.2)/2 = 2.1 → +42.9%.
    const high = ari.compares.find((c) => c.key === "high")!;
    expect(high.latest).toBeCloseTo(3.0, 5);
    expect(high.priorMean).toBeCloseTo(2.1, 5);
    expect(high.deltaPct!).toBeGreaterThan(40);
    expect(high.z!).toBeGreaterThan(0);
  });

  it("team series pools the latest match-day vs prior days", () => {
    const t = teamFirstHalfSeries(rows);
    expect(t.latestDate).toBe("2026-05-15");
    // Latest day pools p1 (3.0) + p2 (2.0) high/min → mean 2.5.
    const latest = t.matches[0];
    expect(latest.sessionDate).toBe("2026-05-15");
    expect(latest.high).toBeCloseTo(2.5, 5);
    expect(latest.nPlayers).toBe(2);
  });
});
