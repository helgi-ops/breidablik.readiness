import type {
  CollapseRiskBand,
  FatigueAccumulationBand,
  InstabilityWindowBand,
  NeuralVolatilityIntelligenceDecision,
  PeakWindowBand,
  TeamNeuralVolatilitySummary,
} from "./types";

type TeamInput = Array<{ playerId?: string; playerName?: string; decision: NeuralVolatilityIntelligenceDecision }>;

const FATIGUE_COUNTS: Record<FatigueAccumulationBand, number> = {
  LOW: 0,
  BUILDING: 0,
  ELEVATED: 0,
  HEAVY: 0,
};

const INSTABILITY_COUNTS: Record<InstabilityWindowBand, number> = {
  STABLE: 0,
  WATCH: 0,
  UNSTABLE: 0,
  HIGHLY_UNSTABLE: 0,
};

const COLLAPSE_COUNTS: Record<CollapseRiskBand, number> = {
  LOW: 0,
  WATCH: 0,
  HIGH: 0,
  CRITICAL: 0,
};

const PEAK_COUNTS: Record<PeakWindowBand, number> = {
  NOT_READY: 0,
  APPROACHING: 0,
  OPEN: 0,
  PEAK: 0,
};

/**
 * Aggregate player-level neural+volatility outputs into team-level watchlists.
 */
export function buildTeamNeuralVolatilitySummary(decisions: TeamInput): TeamNeuralVolatilitySummary {
  const fatigueCounts = { ...FATIGUE_COUNTS };
  const instabilityCounts = { ...INSTABILITY_COUNTS };
  const collapseCounts = { ...COLLAPSE_COUNTS };
  const peakCounts = { ...PEAK_COUNTS };

  const unstablePlayers: TeamNeuralVolatilitySummary["unstablePlayers"] = [];
  const collapseWatchPlayers: TeamNeuralVolatilitySummary["collapseWatchPlayers"] = [];
  const peakWindowPlayers: TeamNeuralVolatilitySummary["peakWindowPlayers"] = [];

  for (const row of decisions) {
    const d = row.decision;
    fatigueCounts[d.fatigueAccumulation.band] += 1;
    instabilityCounts[d.instabilityWindow.band] += 1;
    collapseCounts[d.collapseRisk.band] += 1;
    peakCounts[d.peakWindow.band] += 1;

    if (d.instabilityWindow.band === "UNSTABLE" || d.instabilityWindow.band === "HIGHLY_UNSTABLE") {
      unstablePlayers.push({
        playerId: row.playerId,
        playerName: row.playerName,
        instabilityScore: d.instabilityWindow.score,
        instabilityBand: d.instabilityWindow.band,
      });
    }

    if (d.collapseRisk.band === "WATCH" || d.collapseRisk.band === "HIGH" || d.collapseRisk.band === "CRITICAL") {
      collapseWatchPlayers.push({
        playerId: row.playerId,
        playerName: row.playerName,
        collapseScore: d.collapseRisk.score,
        collapseBand: d.collapseRisk.band,
      });
    }

    if (d.peakWindow.band === "OPEN" || d.peakWindow.band === "PEAK") {
      peakWindowPlayers.push({
        playerId: row.playerId,
        playerName: row.playerName,
        peakScore: d.peakWindow.score,
        peakBand: d.peakWindow.band,
      });
    }
  }

  unstablePlayers.sort((a, b) => b.instabilityScore - a.instabilityScore);
  collapseWatchPlayers.sort((a, b) => b.collapseScore - a.collapseScore);
  peakWindowPlayers.sort((a, b) => b.peakScore - a.peakScore);

  const summaryText =
    collapseCounts.CRITICAL > 0
      ? "Critical collapse windows detected; use recovery-first protection."
      : collapseWatchPlayers.length >= 3
        ? `${collapseWatchPlayers.length} players are on collapse watch; tighten first-block monitoring.`
        : unstablePlayers.length >= 3
          ? `${unstablePlayers.length} players show elevated instability despite mixed top-line readiness.`
          : peakWindowPlayers.length >= Math.max(3, Math.floor(decisions.length * 0.3))
            ? "Multiple players are entering open/peak windows with stable recovery." 
            : "Neural and volatility profile is broadly stable across the squad.";

  return {
    fatigueCounts,
    instabilityCounts,
    collapseCounts,
    peakCounts,
    unstablePlayers,
    collapseWatchPlayers,
    peakWindowPlayers,
    summaryText,
  };
}
