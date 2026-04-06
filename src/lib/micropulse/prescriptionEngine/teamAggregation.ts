import type { PrescriptionDecision, TeamPrescriptionSummary, TrainingAction } from "./types";

type TeamInput = Array<{ playerId?: string; playerName?: string; decision: PrescriptionDecision }>;

function severityFromDecision(decision: PrescriptionDecision): number {
  const actionBase = decision.action === "HOLD" ? 100 : decision.action === "RECOVERY" ? 78 : decision.action === "MODIFIED" ? 48 : 18;
  const modAdj = decision.modificationLevel === "HEAVY" ? 10 : decision.modificationLevel === "MODERATE" ? 5 : 0;
  const capAdj =
    decision.intensityCap === "RECOVERY_ONLY"
      ? 12
      : decision.intensityCap === "CAP_LOW"
      ? 8
      : decision.intensityCap === "CAP_MODERATE"
      ? 4
      : 0;
  const volAdj =
    decision.volumeAdjustment === "REDUCE_50"
      ? 12
      : decision.volumeAdjustment === "REDUCE_30"
      ? 8
      : decision.volumeAdjustment === "REDUCE_20"
      ? 5
      : decision.volumeAdjustment === "REDUCE_10"
      ? 2
      : 0;
  return Math.min(100, actionBase + modAdj + capAdj + volAdj);
}

/**
 * Aggregate per-player prescription decisions into coach-ready team action summary.
 */
export function buildTeamPrescriptionSummary(decisions: TeamInput): TeamPrescriptionSummary {
  const actionGroups: TeamPrescriptionSummary["actionGroups"] = {
    full: [],
    modified: [],
    recovery: [],
    hold: [],
  };

  let protectForMatchCount = 0;
  let recoveryFocusCount = 0;
  let limitedExposureCount = 0;

  for (const row of decisions) {
    const ref = { playerId: row.playerId, playerName: row.playerName };
    const action: TrainingAction = row.decision.action;
    if (action === "FULL") actionGroups.full.push(ref);
    else if (action === "MODIFIED") actionGroups.modified.push(ref);
    else if (action === "RECOVERY") actionGroups.recovery.push(ref);
    else actionGroups.hold.push(ref);

    if (row.decision.matchContext.includes("PROTECT_FOR_MATCH")) protectForMatchCount += 1;
    if (!row.decision.recoveryFocus.includes("NO_EXTRA_RECOVERY_NEEDED")) recoveryFocusCount += 1;
    if (
      row.decision.exposureGuidance.some((t) =>
        ["LIMIT_MAX_SPEED", "LIMIT_DECELS", "LIMIT_CONTACT", "LIMIT_PLYOS", "LIMIT_FIELD_MINUTES", "LIMIT_GYM_INTENSITY"].includes(t),
      )
    ) {
      limitedExposureCount += 1;
    }
  }

  const highestConcernPlayers = [...decisions]
    .map((row) => ({
      playerId: row.playerId,
      playerName: row.playerName,
      action: row.decision.action,
      severity: severityFromDecision(row.decision),
    }))
    .sort((a, b) => b.severity - a.severity)
    .slice(0, 8);

  const fullCount = actionGroups.full.length;
  const modifiedCount = actionGroups.modified.length;
  const recoveryCount = actionGroups.recovery.length;
  const holdCount = actionGroups.hold.length;

  const summaryText =
    holdCount > 0
      ? `${fullCount} full, ${modifiedCount} modified, ${recoveryCount} recovery, ${holdCount} hold. Immediate protection needed for highest-concern players.`
      : `${fullCount} full, ${modifiedCount} modified, ${recoveryCount} recovery. Protect-for-match: ${protectForMatchCount}, limited exposure: ${limitedExposureCount}.`;

  return {
    fullCount,
    modifiedCount,
    recoveryCount,
    holdCount,
    protectForMatchCount,
    recoveryFocusCount,
    limitedExposureCount,
    summaryText,
    actionGroups,
    highestConcernPlayers,
  };
}
