import type { PlayerDecisionListItem, TeamAlert } from "./types";

function buildClusterAlert(args: {
  id: string;
  severity: TeamAlert["severity"];
  title: string;
  description: string;
  players: PlayerDecisionListItem[];
  flags?: string[];
}): TeamAlert | null {
  if (!args.players.length) return null;
  return {
    id: args.id,
    severity: args.severity,
    title: args.title,
    description: args.description,
    count: args.players.length,
    playerIds: args.players.map((player) => player.athleteId),
    playerNames: args.players.slice(0, 5).map((player) => player.athleteName),
    flags: args.flags,
  };
}

const severityRank: Record<TeamAlert["severity"], number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

export function buildTeamAlerts(players: PlayerDecisionListItem[]): TeamAlert[] {
  if (!players.length) return [];

  const redPlayers = players.filter((player) => player.state === "RED" || player.sessionMode === "recovery");
  const injuryRiskHigh = players.filter((player) => player.riskFlags.includes("injury_risk_high"));
  const highAcwr = players.filter((player) => player.riskFlags.includes("high_acwr"));
  const highAcwrWithRecovery = players.filter(
    (player) =>
      player.riskFlags.includes("high_acwr") &&
      (player.riskFlags.includes("high_soreness") || player.riskFlags.includes("low_recovery"))
  );
  const manualReview = players.filter(
    (player) => player.state === "GRAY" || player.confidenceBand === "low" || player.riskFlags.includes("manual_review")
  );
  const modified = players.filter((player) => player.sessionMode === "modified");
  const missingData = players.filter(
    (player) => player.riskFlags.includes("missing_load_data") || player.riskFlags.includes("missing_wellness")
  );
  const loadSpike = players.filter((player) => player.riskFlags.includes("load_spike"));
  const recentLoadDrop = players.filter((player) => player.riskFlags.includes("recent_load_drop"));
  const highAccelDecel = players.filter((player) => player.riskFlags.includes("high_accel_decel_exposure"));
  const lowConfidence = players.filter((player) => player.confidenceBand === "low");
  const mostlyGreen = players.filter((player) => player.state === "GREEN").length >= Math.ceil(players.length * 0.7);

  const alerts = [
    buildClusterAlert({
      id: "red-cluster",
      severity: "critical",
      title: `${redPlayers.length} players need recovery handling`,
      description: "Recovery-only recommendations are clustered and require direct staff attention.",
      players: redPlayers,
      flags: ["recovery_only"],
    }),
    buildClusterAlert({
      id: "injury-risk-high",
      severity: "critical",
      title: `${injuryRiskHigh.length} players have high injury-risk flags`,
      description: "These players should be checked before normal field exposure.",
      players: injuryRiskHigh,
      flags: ["injury_risk_high"],
    }),
    buildClusterAlert({
      id: "high-acwr-cluster",
      severity: "critical",
      title: `${highAcwr.length} players in high ACWR zone`,
      description: "Load-related risk is elevated and may require reduced high-speed exposure.",
      players: highAcwr,
      flags: ["high_acwr"],
    }),
    buildClusterAlert({
      id: "high-acwr-recovery-cluster",
      severity: "critical",
      title: `${highAcwrWithRecovery.length} players have high load with poor recovery`,
      description: "High acute load is combining with poor recovery markers and should influence today’s plan.",
      players: highAcwrWithRecovery,
      flags: ["high_acwr", "high_soreness", "low_recovery"],
    }),
    manualReview.length >= 2
      ? buildClusterAlert({
          id: "manual-review-cluster",
          severity: "critical",
          title: `${manualReview.length} players need manual review`,
          description: "Decision confidence is low or inputs are incomplete for these athletes.",
          players: manualReview,
          flags: ["manual_review"],
        })
      : null,
    buildClusterAlert({
      id: "modified-cluster",
      severity: "warning",
      title: `${modified.length} players require modification`,
      description: "Planned session is viable, but these athletes need individualized adjustment.",
      players: modified,
    }),
    buildClusterAlert({
      id: "missing-data-cluster",
      severity: "warning",
      title: `${missingData.length} players have missing key inputs`,
      description: "Confidence is limited because wellness or load data is incomplete.",
      players: missingData,
      flags: ["missing_load_data", "missing_wellness"],
    }),
    buildClusterAlert({
      id: "load-spike-cluster",
      severity: "warning",
      title: `${loadSpike.length} players show load spikes`,
      description: "Recent load has moved above recent norm and should be monitored.",
      players: loadSpike,
      flags: ["load_spike"],
    }),
    buildClusterAlert({
      id: "load-drop-cluster",
      severity: "warning",
      title: `${recentLoadDrop.length} players show recent load drops`,
      description: "Recent training load has dropped sharply and may require closer monitoring.",
      players: recentLoadDrop,
      flags: ["recent_load_drop"],
    }),
    buildClusterAlert({
      id: "mechanical-load-cluster",
      severity: "warning",
      title: `${highAccelDecel.length} players have high accel / decel exposure`,
      description: "Mechanical loading is elevated and may warrant tighter braking-density control.",
      players: highAccelDecel,
      flags: ["high_accel_decel_exposure"],
    }),
    buildClusterAlert({
      id: "low-confidence-cluster",
      severity: "warning",
      title: `${lowConfidence.length} low-confidence decisions`,
      description: "Some recommendations rely on partial inputs and should be reviewed in context.",
      players: lowConfidence,
    }),
    mostlyGreen
      ? {
          id: "mostly-green",
          severity: "info",
          title: "Team mostly green today",
          description: "Most players are available for planned work with only limited monitoring required.",
          count: players.filter((player) => player.state === "GREEN").length,
        }
      : null,
    modified.length <= 2 && redPlayers.length === 0
      ? {
          id: "limited-modifications",
          severity: "info",
          title: "Only a small number of modifications required",
          description: "Team session can proceed with light individualization for a few players.",
          count: modified.length,
        }
      : null,
  ].filter((alert): alert is TeamAlert => alert != null && ((alert.count ?? 0) > 0 || alert.id === "mostly-green" || alert.id === "limited-modifications"));

  return alerts
    .sort((a, b) => {
      const severityDiff = severityRank[a.severity] - severityRank[b.severity];
      if (severityDiff !== 0) return severityDiff;
      return (b.count ?? 0) - (a.count ?? 0);
    })
    .slice(0, 6);
}
