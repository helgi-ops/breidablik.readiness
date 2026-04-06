import type { PerformanceIntelligenceDecision } from "./types";

export type PlayerRiskTrendInput = Array<{
  date: string;
  decision?: PerformanceIntelligenceDecision | null;
  readinessState?: "GREEN" | "YELLOW" | "RED" | "GRAY" | null;
  riskScore?: number | null;
}>;

export type PlayerRiskTrend = {
  dates: string[];
  riskScores: number[];
  readinessStates: Array<"GREEN" | "YELLOW" | "RED" | "GRAY">;
};

/**
 * Build a deterministic player risk trend for chart overlays.
 */
export function buildPlayerRiskTrend(playerHistory: PlayerRiskTrendInput): PlayerRiskTrend {
  const sorted = [...playerHistory].sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(-7);
  const dates: string[] = [];
  const riskScores: number[] = [];
  const readinessStates: Array<"GREEN" | "YELLOW" | "RED" | "GRAY"> = [];

  for (const row of sorted) {
    const scoreRaw = row.decision?.injuryRisk.score ?? row.riskScore ?? null;
    if (scoreRaw == null || !Number.isFinite(scoreRaw)) continue;
    dates.push(String(row.date).slice(0, 10));
    riskScores.push(Math.max(0, Math.min(100, scoreRaw)));
    const inferredState =
      scoreRaw >= 75
        ? "RED"
        : scoreRaw >= 55
          ? "YELLOW"
          : scoreRaw >= 30
            ? "GREEN"
            : "GREEN";
    readinessStates.push((row.readinessState ?? inferredState) as "GREEN" | "YELLOW" | "RED" | "GRAY");
  }

  return { dates, riskScores, readinessStates };
}
