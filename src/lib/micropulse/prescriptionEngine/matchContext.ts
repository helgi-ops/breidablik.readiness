import { clamp } from "./normalize";
import type { DriverContribution, MatchContextTag, NormalizedPrescriptionInput } from "./types";

export type MatchContextDecision = {
  matchContext: MatchContextTag[];
  primaryDrivers: DriverContribution[];
  secondaryDrivers: DriverContribution[];
  confidence: number;
  summary: string;
};

function push(drivers: DriverContribution[], key: string, label: string, contribution: number, direction: DriverContribution["direction"], value?: number | null): void {
  if (Math.abs(contribution) < 0.001) return;
  drivers.push({ key, label, contribution, direction, value: value ?? null });
}

function rank(drivers: DriverContribution[]) {
  const sorted = [...drivers].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  return { primary: sorted.slice(0, 3), secondary: sorted.slice(3, 6) };
}

function dedupe(tags: MatchContextTag[]): MatchContextTag[] {
  return Array.from(new Set(tags));
}

/**
 * Add practical match-week context tags for training prescription framing.
 */
export function buildMatchContextDecision(input: NormalizedPrescriptionInput): MatchContextDecision {
  const drivers: DriverContribution[] = [];
  const tags: MatchContextTag[] = [];

  if (input.dayType === "matchday" || (input.upcomingMatchInDays ?? 99) <= 1) {
    tags.push("PROTECT_FOR_MATCH");
    push(drivers, "match_proximity", "Match proximity", 12, "risk", input.upcomingMatchInDays ?? null);
  }

  if (input.dayType === "md+1") {
    tags.push("RESTORE_AFTER_MATCH");
    push(drivers, "post_match", "Post-match restoration context", 10, "risk", null);
  }

  if ((input.matchCongestionScore ?? 0) >= 60 || input.weekDensity === "congested") {
    tags.push("DELOAD_ACCUMULATION");
    push(drivers, "congested_week", "Congested week", 10, "risk", input.matchCongestionScore ?? null);
  }

  if (
    input.dayType === "md-3" &&
    (input.peakWindowBand === "OPEN" || input.peakWindowBand === "PEAK") &&
    input.collapseRiskBand !== "HIGH" &&
    input.collapseRiskBand !== "CRITICAL"
  ) {
    tags.push("PUSH_TRAINING_ADAPTATION");
    push(drivers, "md3_adaptation", "MD-3 adaptation opportunity", -8, "positive", null);
  }

  if (!tags.length) {
    tags.push("MAINTAIN_READINESS");
    push(drivers, "maintain", "Maintain readiness context", -4, "protective", null);
  }

  const deduped = dedupe(tags);
  const ranked = rank(drivers);

  return {
    matchContext: deduped,
    primaryDrivers: ranked.primary,
    secondaryDrivers: ranked.secondary,
    confidence: clamp(input.dataConfidence ?? 0.5, 0, 1),
    summary: `Match context: ${deduped.map((t) => t.toLowerCase().replace(/_/g, " ")).join(", ")}.`,
  };
}
