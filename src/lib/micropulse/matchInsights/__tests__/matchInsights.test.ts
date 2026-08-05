import { describe, it, expect } from "vitest";
import { pearson, MIN_CORRELATION_N } from "../correlation";
import { winLossMovement } from "../winLoss";
import type { MatchMetricRow } from "../winLoss";
import { extendedMetricsForRow } from "../extendedMetrics";
import { buildMatchNarrative, summarizeResultCorrelations, summarizeStatMovement } from "../narrative";
import type { WinLossResult } from "../winLoss";
import { latestMatchHalfCompare, type HalfPeriodRow } from "../../matchIntensityHalves";

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

  it("calls out the biggest second-half drop, else says intensity held", () => {
    const faded = buildMatchNarrative({
      lang: "EN", label, winLoss: null,
      resultCorrelations: [], seasonXg: { available: false, correlations: [] },
      firstHalf: { sessionDate: "2026-05-15", metrics: [
        { key: "hsr", h1: 6, h2: 4.5, deltaPct: -25 },   // biggest drop
        { key: "high", h1: 3, h2: 2.9, deltaPct: -3.3 }, // below the 10% floor
      ] },
    });
    expect(faded.points.some((p) => p.text.includes("fell 25.0%") && p.text.includes("hsr") && p.text.includes("6.00 → 4.50"))).toBe(true);

    const held = buildMatchNarrative({
      lang: "EN", label, winLoss: null,
      resultCorrelations: [], seasonXg: { available: false, correlations: [] },
      firstHalf: { sessionDate: "2026-05-15", metrics: [
        { key: "high", h1: 3, h2: 2.95, deltaPct: -1.7 },
      ] },
    });
    expect(held.points.some((p) => p.text.includes("held first-half intensity"))).toBe(true);
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

describe("summarizeResultCorrelations", () => {
  const label = (k: string) => k;
  it("names the strongest result + season-xG links, cited, with a caveat", () => {
    const s = summarizeResultCorrelations({
      lang: "EN", label, matches: 18,
      result: [
        { key: "hsr", r: 0.52, n: 18, strength: "strong", direction: "positive" },
        { key: "codHigh", r: -0.44, n: 18, strength: "moderate", direction: "negative" },
        { key: "noise", r: 0.05, n: 18, strength: "weak", direction: "positive" }, // below 0.3 → dropped
      ],
      seasonXg: { available: true, correlations: [{ key: "sprint", r: 0.6, n: 21, strength: "strong", direction: "positive" }] },
    });
    expect(s).toContain("Across 18 matches");
    expect(s).toContain("more hsr went with better results (r=0.52)");
    expect(s).toContain("more codHigh went with poorer results (r=-0.44)"); // negative → poorer
    expect(s).not.toContain("noise");
    expect(s).toContain("Season xG: players with more sprint carried higher xG");
    expect(s).toContain("Association, not cause.");
  });

  it("drops correlations below the n floor and says so", () => {
    const s = summarizeResultCorrelations({
      lang: "EN", label, matches: 6,
      result: [{ key: "hsr", r: 0.9, n: 6, strength: "strong", direction: "positive" }],
      seasonXg: { available: false, correlations: [] },
    });
    expect(s).toContain("No movement metric tracks the result strongly enough yet (6 matches)");
    expect(s).not.toContain("r=0.90");
  });
});

describe("summarizeStatMovement", () => {
  it("picks the strongest stat↔movement links across stats", () => {
    const s = summarizeStatMovement({
      lang: "EN", statLabel: (k) => k, moveLabel: (k) => k, matches: 18,
      stats: [
        { key: "possession", corr: [{ key: "totalDistPerMin", r: 0.55, n: 18, strength: "strong", direction: "positive" }] },
        { key: "shots", corr: [{ key: "hsr", r: -0.4, n: 18, strength: "moderate", direction: "negative" }] },
        { key: "duelsWonPct", corr: [{ key: "x", r: 0.1, n: 18, strength: "weak", direction: "positive" }] }, // dropped
      ],
    });
    expect(s).toContain("more totalDistPerMin went with higher possession (r=0.55)");
    expect(s).toContain("more hsr went with lower shots (r=-0.40)");
    expect(s).toContain("Association, not cause.");
  });

  it("honest empty when nothing clears the bar", () => {
    const s = summarizeStatMovement({
      lang: "EN", statLabel: (k) => k, moveLabel: (k) => k, matches: 4,
      stats: [{ key: "possession", corr: [{ key: "x", r: 0.9, n: 4, strength: "strong", direction: "positive" }] }],
    });
    expect(s).toContain("No stat links to movement strongly enough yet (4 matches)");
  });
});

describe("latestMatchHalfCompare", () => {
  // Latest match (05-15): p1 fades in the 2nd half, p2 holds. An older match
  // (05-08) and a one-half sub must not affect the latest-match read.
  const rows: HalfPeriodRow[] = [
    // p1, latest match — high/min 3.0 → 2.0 (a 33% fade)
    { playerId: "p1", playerName: "Ari", sessionDate: "2026-05-15", half: 1, durationMin: 45, highIma: 135, imaAccel: 60, imaDecel: 60, imaCodTotal: 30, hirTotal: 675, playerLoadPerMin: 9 },
    { playerId: "p1", playerName: "Ari", sessionDate: "2026-05-15", half: 2, durationMin: 45, highIma: 90, imaAccel: 40, imaDecel: 40, imaCodTotal: 20, hirTotal: 450, playerLoadPerMin: 6 },
    // p2, latest match — high/min 2.0 → 2.0 (holds)
    { playerId: "p2", playerName: "Bjarni", sessionDate: "2026-05-15", half: 1, durationMin: 45, highIma: 90, imaAccel: 40, imaDecel: 40, imaCodTotal: 20, hirTotal: 450, playerLoadPerMin: 6 },
    { playerId: "p2", playerName: "Bjarni", sessionDate: "2026-05-15", half: 2, durationMin: 45, highIma: 90, imaAccel: 40, imaDecel: 40, imaCodTotal: 20, hirTotal: 450, playerLoadPerMin: 6 },
    // p3, latest match — only one half → excluded (no within-match compare)
    { playerId: "p3", playerName: "Cato", sessionDate: "2026-05-15", half: 1, durationMin: 45, highIma: 90, imaAccel: 40, imaDecel: 40, imaCodTotal: 20, hirTotal: 450, playerLoadPerMin: 6 },
    // p1, an OLDER match — must be ignored (latest date wins)
    { playerId: "p1", playerName: "Ari", sessionDate: "2026-05-08", half: 1, durationMin: 45, highIma: 45, imaAccel: 20, imaDecel: 20, imaCodTotal: 10, hirTotal: 225, playerLoadPerMin: 3 },
    { playerId: "p1", playerName: "Ari", sessionDate: "2026-05-08", half: 2, durationMin: 45, highIma: 45, imaAccel: 20, imaDecel: 20, imaCodTotal: 10, hirTotal: 225, playerLoadPerMin: 3 },
  ];

  it("compares the latest match's 1st vs 2nd half, pooling both-halves players only", () => {
    const c = latestMatchHalfCompare(rows);
    expect(c.sessionDate).toBe("2026-05-15");
    expect(c.nPlayers).toBe(2); // p3 (one half) excluded
    const high = c.metrics.find((m) => m.key === "high")!;
    // team h1 = mean(3.0, 2.0) = 2.5; h2 = mean(2.0, 2.0) = 2.0 → −20%.
    expect(high.h1).toBeCloseTo(2.5, 5);
    expect(high.h2).toBeCloseTo(2.0, 5);
    expect(high.deltaPct).toBeCloseTo(-20, 5);
  });

  it("per-player rows carry each player's own 1st→2nd-half delta", () => {
    const c = latestMatchHalfCompare(rows);
    const ari = c.players.find((p) => p.playerId === "p1")!;
    const bjarni = c.players.find((p) => p.playerId === "p2")!;
    expect(ari.metrics.find((m) => m.key === "high")!.deltaPct).toBeCloseTo(-33.3, 1); // 3.0 → 2.0
    expect(bjarni.metrics.find((m) => m.key === "high")!.deltaPct).toBeCloseTo(0, 5);   // holds
    expect(c.players.some((p) => p.playerId === "p3")).toBe(false);                      // one-half sub excluded
  });

  it("returns an honest empty state when no match has both halves", () => {
    const oneHalf: HalfPeriodRow[] = [
      { playerId: "p1", playerName: "Ari", sessionDate: "2026-05-15", half: 1, durationMin: 45, highIma: 90, imaAccel: 40, imaDecel: 40, imaCodTotal: 20 },
    ];
    const c = latestMatchHalfCompare(oneHalf);
    expect(c.sessionDate).toBeNull();
    expect(c.nPlayers).toBe(0);
    expect(c.metrics).toHaveLength(0);
  });
});
