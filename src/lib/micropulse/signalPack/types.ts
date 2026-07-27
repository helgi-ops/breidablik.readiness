/**
 * Explainable Signal Pack — shared types.
 *
 * Each signal is a NAMED, CITED, COUNTERFACTUAL "why" contributor, computed as a simple
 * per-player rolling calculation — NOT a trained model (the assessment is decisive: a
 * classifier over-flags at 25-player scale, Haller 2023 / Leckey 2024). These enrich the
 * existing layered read; they never overwrite the canonical verdict colour.
 */

export type Bi = { en: string; is: string };
export type SigConfidence = "low" | "moderate" | "high";

/**
 * Audience voice for the "why" / counterfactual strings. Same engine, same thresholds —
 * only the pronouns change ("His sleep…" for the coach, "Your sleep…" for the player).
 * Icelandic possessives agree with noun gender, so each builder carries explicit second-
 * person variants rather than substituting pronouns blindly.
 */
export type Voice = "coach" | "player";

export interface SignalContributor {
  /** Stable id, e.g. "load_acwr" | "decel_acwr" | "hsr_acwr" | "injury_recency" | "monotony" | "sleep" | "cmj_jump" | "cmj_asym". */
  key: string;
  /** Plain, coach-readable name (no jargon). */
  label: Bi;
  /** First-read plain-language line — the "why". */
  why: Bi;
  /** "if X had been Y → clear" — null for context-only signals (e.g. injury history). */
  counterfactual: Bi | null;
  /** Paper citation for this signal. */
  citation: string;
  /** Per-player confidence from baseline maturity / coverage. Thin data → "low". */
  confidence: SigConfidence;
  /** 0..1 for ranking contributors; higher = more concerning. */
  severity: number;
  /** True when the player's OWN threshold is exceeded (or elevated context). */
  flagged: boolean;
  /** Jargon / behind-the-numbers detail (tooltip / "Show details"). */
  detail: Bi;
}

/** Coverage-based confidence for a rolling signal — thin data is never a scold. */
export function coverageConfidence(days: number): SigConfidence {
  if (days >= 21) return "high";
  if (days >= 10) return "moderate";
  return "low";
}
