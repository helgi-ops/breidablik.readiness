import { DECISION_THRESHOLDS } from "./constants";
import type { DecisionConfidenceBand, DecisionState, ExplanationFactor } from "./types";

export function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function roundNumber(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function coerceState(value: unknown): DecisionState | null {
  if (typeof value !== "string") return null;
  const upper = value.toUpperCase();
  if (upper === "GREEN" || upper === "YELLOW" || upper === "RED" || upper === "GRAY") return upper;
  return null;
}

type WellnessBand = "good" | "moderate" | "poor" | "unknown";

export function normalizeSoreness(value: number | null | undefined): WellnessBand {
  if (!isFiniteNumber(value)) return "unknown";
  if (value <= DECISION_THRESHOLDS.HIGH_SORENESS_BAD) return "poor";
  if (value <= DECISION_THRESHOLDS.MODERATE_SORENESS_BAD) return "moderate";
  return "good";
}

export function normalizeRecovery(value: number | null | undefined): WellnessBand {
  if (!isFiniteNumber(value)) return "unknown";
  if (value <= DECISION_THRESHOLDS.LOW_RECOVERY_BAD) return "poor";
  if (value <= DECISION_THRESHOLDS.MODERATE_RECOVERY_BAD) return "moderate";
  return "good";
}

export function normalizeSleepQuality(value: number | null | undefined): WellnessBand {
  if (!isFiniteNumber(value)) return "unknown";
  if (value <= DECISION_THRESHOLDS.LOW_SLEEP_BAD) return "poor";
  if (value <= DECISION_THRESHOLDS.MODERATE_SLEEP_BAD) return "moderate";
  return "good";
}

export function normalizeFatigue(value: number | null | undefined): WellnessBand {
  if (!isFiniteNumber(value)) return "unknown";
  // Energy/fatigue uses 1–5 scale (1=very tired, 5=very fresh): lower value = worse
  if (value <= DECISION_THRESHOLDS.HIGH_FATIGUE_BAD) return "poor";
  if (value <= DECISION_THRESHOLDS.MODERATE_FATIGUE_BAD) return "moderate";
  return "good";
}

export function normalizeStress(value: number | null | undefined): WellnessBand {
  if (!isFiniteNumber(value)) return "unknown";
  // Stress/mood uses 1–5 scale (1=very stressed/bad mood, 5=calm/good mood): lower value = worse
  if (value <= DECISION_THRESHOLDS.HIGH_STRESS_BAD) return "poor";
  if (value <= DECISION_THRESHOLDS.MODERATE_STRESS_BAD) return "moderate";
  return "good";
}

export function normalizeZScore(value: number | null | undefined): WellnessBand {
  if (!isFiniteNumber(value)) return "unknown";
  // Z-score: 0 = at own mean; negative = below baseline; more negative = worse
  // Thresholds based on Thornton et al. (2019), Int J Sports Physiol Perform
  if (value <= DECISION_THRESHOLDS.LOW_Z_RED) return "poor";    // < −2.0 (red flag)
  if (value <= DECISION_THRESHOLDS.LOW_Z_YELLOW) return "moderate"; // −1.5 to −2.0 (yellow flag)
  return "good"; // > −1.5: within acceptable range
}

export function computeLoadDeltaVs7dAvg(load?: {
  dailyLoad?: number | null;
  rolling7dAvg?: number | null;
  loadDeltaVs7dAvg?: number | null;
} | null): number | null {
  if (isFiniteNumber(load?.loadDeltaVs7dAvg)) return load?.loadDeltaVs7dAvg ?? null;
  if (!isFiniteNumber(load?.dailyLoad) || !isFiniteNumber(load?.rolling7dAvg) || (load?.rolling7dAvg ?? 0) <= 0) return null;
  return (load!.dailyLoad! - load!.rolling7dAvg!) / load!.rolling7dAvg!;
}

export function sortExplanationFactors(factors: ExplanationFactor[]): ExplanationFactor[] {
  return [...factors].sort((a, b) => b.impactScore - a.impactScore);
}

export function dedupeStringArray(arr: string[]): string[] {
  return Array.from(new Set(arr.filter(Boolean)));
}

export function dedupeEnumArray<T extends string>(arr: T[]): T[] {
  return Array.from(new Set(arr.filter(Boolean))) as T[];
}

export function calculateConfidenceBand(score: number): DecisionConfidenceBand {
  if (score >= 0.8) return "high";
  if (score >= 0.6) return "medium";
  return "low";
}

export function safePercent(value: number | null | undefined): number | null {
  if (!isFiniteNumber(value)) return null;
  return roundNumber(value * 100, 0);
}

export function formatPercent(value: number | null | undefined): string {
  const pct = safePercent(value);
  return pct == null ? "—" : `${pct}%`;
}

export function formatNullableNumber(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) return "—";
  if (Math.abs(value) >= 100 || Number.isInteger(value)) return String(roundNumber(value, 0));
  return String(roundNumber(value, 2));
}
