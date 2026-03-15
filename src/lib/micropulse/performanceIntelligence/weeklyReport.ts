import { clamp } from "./normalize";
import type { PerformanceIntelligenceDecision } from "./types";

export type WeeklyRiskReportEntry = {
  playerId?: string;
  playerName?: string;
  date: string;
  decision: PerformanceIntelligenceDecision;
};

export type WeeklyRiskReport = {
  avgRiskScore: number;
  highestRiskPlayers: Array<{ playerId?: string; playerName?: string; riskScore: number }>;
  mostImprovedPlayers: Array<{ playerId?: string; playerName?: string; deltaRisk: number }>;
  mostFatiguedPlayers: Array<{ playerId?: string; playerName?: string; riskScore: number }>;
  teamTrend: string;
  recommendation: string;
};

/**
 * Build a compact weekly risk report from daily performance-intelligence decisions.
 */
export function buildWeeklyRiskReport(dailyDecisions: WeeklyRiskReportEntry[]): WeeklyRiskReport {
  if (!dailyDecisions.length) {
    return {
      avgRiskScore: 0,
      highestRiskPlayers: [],
      mostImprovedPlayers: [],
      mostFatiguedPlayers: [],
      teamTrend: "No weekly risk data available.",
      recommendation: "Continue standard monitoring until enough data accumulates.",
    };
  }

  const grouped = new Map<string, WeeklyRiskReportEntry[]>();
  for (const row of dailyDecisions) {
    const key = String(row.playerId ?? row.playerName ?? "unknown");
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(row);
  }

  const playerLatest: Array<{ playerId?: string; playerName?: string; riskScore: number }> = [];
  const playerDelta: Array<{ playerId?: string; playerName?: string; deltaRisk: number }> = [];
  const allScores: number[] = [];

  for (const rows of grouped.values()) {
    const sorted = [...rows].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const deltaRisk = first.decision.injuryRisk.score - last.decision.injuryRisk.score;

    playerLatest.push({
      playerId: last.playerId,
      playerName: last.playerName,
      riskScore: last.decision.injuryRisk.score,
    });
    playerDelta.push({
      playerId: last.playerId,
      playerName: last.playerName,
      deltaRisk,
    });

    for (const r of sorted) allScores.push(r.decision.injuryRisk.score);
  }

  const avgRiskScore = clamp(allScores.reduce((a, b) => a + b, 0) / Math.max(1, allScores.length), 0, 100);
  const highestRiskPlayers = [...playerLatest].sort((a, b) => b.riskScore - a.riskScore).slice(0, 5);
  const mostFatiguedPlayers = [...playerLatest].sort((a, b) => b.riskScore - a.riskScore).slice(0, 5);
  const mostImprovedPlayers = [...playerDelta].sort((a, b) => b.deltaRisk - a.deltaRisk).slice(0, 5);

  const avgLatestRisk = playerLatest.reduce((sum, p) => sum + p.riskScore, 0) / Math.max(1, playerLatest.length);
  const avgDelta = playerDelta.reduce((sum, p) => sum + p.deltaRisk, 0) / Math.max(1, playerDelta.length);

  const teamTrend =
    avgDelta >= 6
      ? "Risk trending downward across the squad."
      : avgDelta <= -6
      ? "Risk trending upward across the squad."
      : "Risk trend is broadly stable across the squad.";

  const recommendation =
    avgLatestRisk >= 70
      ? "Recovery emphasis recommended for high-risk players."
      : avgLatestRisk >= 52
      ? "Use modified loading for elevated-risk players and monitor first block response."
      : "Maintain planned loading with targeted monitoring for at-risk individuals.";

  return {
    avgRiskScore,
    highestRiskPlayers,
    mostImprovedPlayers,
    mostFatiguedPlayers,
    teamTrend,
    recommendation,
  };
}
