import type { PlayerDecisionListItem, TeamRecommendation } from "./types";

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

export function buildTeamRecommendation(players: PlayerDecisionListItem[]): TeamRecommendation {
  const total = players.length;
  const green = players.filter((player) => player.state === "GREEN").length;
  const yellow = players.filter((player) => player.state === "YELLOW").length;
  const red = players.filter((player) => player.state === "RED").length;
  const modified = players.filter((player) => player.sessionMode === "modified");
  const recoveryOnly = players.filter((player) => player.sessionMode === "recovery");
  const manualReview = players.filter((player) => player.state === "GRAY" || player.confidenceBand === "low");
  const highAcwr = players.filter((player) => player.riskFlags.includes("high_acwr"));
  const highRecoveryConflict = players.filter(
    (player) =>
      player.riskFlags.includes("high_acwr") &&
      (player.riskFlags.includes("high_soreness") || player.riskFlags.includes("low_recovery"))
  );

  let teamMode: TeamRecommendation["teamMode"] = "full_go";
  let loadAdjustmentSuggestion: number | null = 0;

  if (!total) {
    teamMode = "manual_review";
    loadAdjustmentSuggestion = null;
  } else if (manualReview.length >= Math.ceil(total * 0.5)) {
    teamMode = "manual_review";
    loadAdjustmentSuggestion = null;
  } else if (red >= 2 || highRecoveryConflict.length >= 2 || recoveryOnly.length >= 2) {
    teamMode = "recovery_bias";
    loadAdjustmentSuggestion = -0.2;
  } else if (red >= 1 || yellow >= 3 || modified.length >= 3 || highAcwr.length >= 2) {
    teamMode = "train_with_modifications";
    loadAdjustmentSuggestion = -0.15;
  }

  const summary =
    !total
      ? "No player decisions are available for this date."
      : teamMode === "manual_review"
      ? "Use manual review today before committing to a full team prescription."
      : teamMode === "recovery_bias"
      ? "Bias the day toward recovery and lower-cost field exposure."
      : teamMode === "train_with_modifications"
      ? "Proceed with training, but reduce load and individualize exposure for flagged players."
      : "Proceed with planned training for the squad.";

  const rationale = dedupe(
    [
      modified.length ? `${modified.length} players are in modified mode.` : "",
      recoveryOnly.length ? `${recoveryOnly.length} players are in recovery mode.` : "",
      highAcwr.length ? `${highAcwr.length} players show elevated load-related risk.` : "",
      green >= Math.ceil(total * 0.6) ? "Most of the squad remains available for planned work." : "",
      manualReview.length ? `${manualReview.length} players have low-confidence or incomplete decisions.` : "",
    ].filter(Boolean)
  ).slice(0, 4);

  const recommendedConstraints = dedupe(
    players
      .filter((player) => player.state !== "GREEN")
      .flatMap((player) => player.constraints)
      .filter((constraint) => constraint !== "no_change")
  ).slice(0, 4);

  return {
    teamMode,
    loadAdjustmentSuggestion,
    summary,
    rationale,
    recommendedConstraints,
    playersNeedingModification: modified.length,
    playersRecoveryOnly: recoveryOnly.length,
  };
}
