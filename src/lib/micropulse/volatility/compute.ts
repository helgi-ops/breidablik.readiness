import type { PlayerVolatilitySummary, VolatilityDailyPoint, VolatilityDriverScore } from "./types";

type DriverSpec = {
  key: VolatilityDriverScore["key"];
  label: VolatilityDriverScore["label"];
  pick: (p: VolatilityDailyPoint) => number | null;
  normDenominator: number;
};

const DRIVER_SPECS: DriverSpec[] = [
  { key: "check_in", label: "Check-in score", pick: (p) => toFinite(p.checkInScore), normDenominator: 4 },
  { key: "z_score", label: "Z score", pick: (p) => toFinite(p.zScore), normDenominator: 0.75 },
  { key: "delta_z", label: "Delta Z", pick: (p) => toFinite(p.deltaZ), normDenominator: 0.75 },
  { key: "soreness", label: "Soreness", pick: (p) => toFinite(p.soreness), normDenominator: 1 },
  { key: "sleep_quality", label: "Sleep", pick: (p) => toFinite(p.sleepQuality), normDenominator: 1 },
  { key: "mood", label: "Mood", pick: (p) => toFinite(p.mood), normDenominator: 1 },
  { key: "energy", label: "Energy", pick: (p) => toFinite(p.energy), normDenominator: 1 },
  { key: "stress", label: "Stress", pick: (p) => toFinite(p.stress), normDenominator: 1 },
];

function toFinite(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : null;
}

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function toDayLabels(sampleSize: number): string[] {
  return Array.from({ length: sampleSize }).map((_, idx) => {
    const fromEnd = sampleSize - 1 - idx;
    return fromEnd === 0 ? "Today" : `D-${fromEnd}`;
  });
}

function levelFromScore(score: number | null): PlayerVolatilitySummary["level"] {
  if (score == null) return "INSUFFICIENT";
  if (score < 33) return "LOW";
  if (score < 66) return "MODERATE";
  return "HIGH";
}

function interpretationFromLevel(level: PlayerVolatilitySummary["level"], windowDays: number): string {
  if (level === "LOW") return `Stable recent profile across the last ${windowDays} days.`;
  if (level === "MODERATE") return `Some short-term fluctuation detected over the last ${windowDays} days.`;
  if (level === "HIGH") return `Marked day-to-day variability detected over the last ${windowDays} days.`;
  return "Insufficient recent data to assess short-term volatility.";
}

function computeDriver(points: VolatilityDailyPoint[], spec: DriverSpec): VolatilityDriverScore | null {
  const values = points
    .map((p) => spec.pick(p))
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));

  if (values.length < 2) return null;

  let totalDiff = 0;
  for (let i = 1; i < values.length; i += 1) {
    totalDiff += Math.abs(values[i] - values[i - 1]);
  }

  const avgDiff = totalDiff / (values.length - 1);
  const normalized = clamp01(avgDiff / spec.normDenominator);

  return {
    key: spec.key,
    label: spec.label,
    volatilityScore: Number((normalized * 100).toFixed(2)),
    normalizedScore: Number(normalized.toFixed(4)),
  };
}

function computeDailyComposite(points: VolatilityDailyPoint[]): number[] {
  if (points.length < 2) return [];
  const list: number[] = [];

  for (let i = 1; i < points.length; i += 1) {
    const curr = points[i];
    const prev = points[i - 1];
    const normalizedDiffs: number[] = [];

    for (const spec of DRIVER_SPECS) {
      const a = spec.pick(prev);
      const b = spec.pick(curr);
      if (a == null || b == null) continue;
      normalizedDiffs.push(clamp01(Math.abs(b - a) / spec.normDenominator));
    }

    const composite = normalizedDiffs.length ? normalizedDiffs.reduce((acc, v) => acc + v, 0) / normalizedDiffs.length : 0;
    list.push(Number((composite * 100).toFixed(2)));
  }

  return list;
}

export function computePlayerVolatilitySummary(points: VolatilityDailyPoint[]): PlayerVolatilitySummary {
  const cleaned = [...points]
    .filter((p) => !!String(p.date ?? "").trim())
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const sampleSize = cleaned.length;
  const windowDays = sampleSize >= 7 ? 7 : sampleSize >= 6 ? 6 : sampleSize >= 5 ? 5 : sampleSize;
  const windowPoints = cleaned.slice(-windowDays);

  if (windowPoints.length < 3) {
    return {
      sampleSize: windowPoints.length,
      windowDays,
      hasEnoughData: false,
      overallScore: null,
      level: "INSUFFICIENT",
      interpretation: interpretationFromLevel("INSUFFICIENT", windowDays || 0),
      drivers: [],
      dayLabels: toDayLabels(windowPoints.length),
      dailyComposite: [],
      currentVsTrendNote: null,
      counterfactual: null,
    };
  }

  const drivers = DRIVER_SPECS.map((spec) => computeDriver(windowPoints, spec)).filter((d): d is VolatilityDriverScore => !!d);
  const normalizedDrivers = drivers.map((d) => d.normalizedScore);
  const overallNormalized = normalizedDrivers.length ? normalizedDrivers.reduce((acc, v) => acc + v, 0) / normalizedDrivers.length : 0;
  const overallScore = Number((overallNormalized * 100).toFixed(2));
  const level = levelFromScore(overallScore);
  const rankedDrivers = [...drivers].sort((a, b) => b.normalizedScore - a.normalizedScore);
  const sortedDrivers = rankedDrivers.slice(0, 3);

  // Counterfactual: hold the single biggest-contributing signal steady and
  // recompute the level from the remaining drivers. This is the "if X had been
  // steady → GREEN/lower" the manifesto requires for every flagged player.
  let counterfactual: PlayerVolatilitySummary["counterfactual"] = null;
  if (rankedDrivers.length >= 2) {
    const top = rankedDrivers[0];
    const rest = rankedDrivers.slice(1);
    const restMean = rest.reduce((acc, d) => acc + d.normalizedScore, 0) / rest.length;
    const newScore = Number((restMean * 100).toFixed(2));
    counterfactual = { driverKey: top.key, driverLabel: top.label, newScore, newLevel: levelFromScore(newScore) };
  }

  const latest = windowPoints[windowPoints.length - 1];
  const avgZ =
    windowPoints
      .map((p) => toFinite(p.zScore))
      .filter((v): v is number => typeof v === "number")
      .reduce((acc, v, idx, arr) => acc + v / arr.length, 0) ?? 0;
  const note =
    toFinite(latest?.zScore) != null && toFinite(latest?.zScore)! > avgZ + 0.4
      ? "Current readiness appears stronger than the recent fluctuation pattern."
      : null;

  return {
    sampleSize: windowPoints.length,
    windowDays,
    hasEnoughData: true,
    overallScore,
    level,
    interpretation: interpretationFromLevel(level, windowDays),
    drivers: sortedDrivers,
    dayLabels: toDayLabels(windowPoints.length),
    dailyComposite: computeDailyComposite(windowPoints),
    currentVsTrendNote: note,
    counterfactual,
  };
}
