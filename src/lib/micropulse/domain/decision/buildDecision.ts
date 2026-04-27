import type { InjuryRiskDecision } from "@/lib/micropulse/injuryRisk";
import type { ExplainableReadinessDecision } from "@/lib/micropulse/readiness";
import { buildDecisionInputFromReadinessContext, buildTrainingRecommendation } from "@/lib/micropulse/decision";
import type { DailyAthleteSnapshot } from "../snapshot/types";
import { buildDecisionExplanationLines, buildDecisionReasons, buildDecisionRecommendations } from "./explanations";
import { buildDecisionFlags } from "./flags";
import { deriveLoadAction } from "./loadAction";
import { deriveSessionMode } from "./sessionMode";
import { applyStreakEscalation, describeStreakContext, type RecentDecision } from "./sequence";
import type { AthleteDecision, AthleteState, NeuralStatus } from "./types";

type BuildAthleteDecisionParams = {
  snapshot: DailyAthleteSnapshot;
  readinessDecision?: ExplainableReadinessDecision | null;
  injuryDecision?: InjuryRiskDecision | null;
  neural?: {
    status?: NeuralStatus | null;
    confidence?: number | null;
    summary?: string | null;
  } | null;
  load?: {
    concernLevel?: "none" | "low" | "moderate" | "high" | null;
    summary?: string | null;
  } | null;
  whoop?: {
    overallSupportScore?: number | null;
    confidence?: number | null;
    explanationLine?: string | null;
  } | null;
  /**
   * Indoor Load Intelligence signals (FMP / IMU höll-mode pipeline).
   * Optional — null when player has no recent indoor sessions or team
   * is purely outdoor. When present, indoor "spike" composite or
   * McBurnie "red" flag bumps athleteState into RED; "heavy" composite
   * or McBurnie "yellow" flag bumps into YELLOW. Without this wiring
   * the verdict ignores the indoor pipeline entirely and only the
   * explanation layer surfaces it.
   */
  indoorLoad?: {
    compositeBand?: "light" | "below_average" | "typical" | "heavy" | "spike" | null;
    mcburnieFlag?: "green" | "yellow" | "red" | null;
    acwrFlag?: "green" | "yellow" | "red" | null;
    summary?: string | null;
  } | null;
  /**
   * Decel Intelligence (McBurnie 2022 4-dimension framework) overall
   * flag. Aggregates overload exposure, underload risk, decel:accel +
   * decel:sprint coupling, and exposure concentration. Red bumps to
   * RED; yellow bumps to YELLOW. Same severity ladder as
   * loadConcernLevel and indoorLoad.
   */
  decelIntelligence?: {
    overallFlag?: "green" | "yellow" | "red" | "unknown" | null;
    summary?: string | null;
  } | null;
  hardBlock?: boolean | null;
  explicitRecoveryDay?: boolean | null;
  /**
   * Recent verdicts for this player (last 7 days, today excluded).
   * Used by sequence-aware escalation (sequence.ts):
   *   - 3+ consecutive YELLOW (today incl) → escalate to RED
   *   - 2+ consecutive RED → tag SUSTAINED_RED reason
   * Without this the verdict is stateless day-by-day and chronic
   * patterns ("she's been yellow all week") are invisible to the coach.
   * Optional — when absent, escalation is a no-op.
   */
  recentDecisions?: RecentDecision[] | null;
};

function mapReadinessConfidence(value?: "low" | "medium" | "high" | null): number {
  if (value === "high") return 0.85;
  if (value === "medium") return 0.65;
  return 0.4;
}

function inferAthleteState(args: {
  hardBlock: boolean;
  rehab: boolean;
  readinessState: AthleteState;
  neuralStatus: NeuralStatus;
  injurySeverity: "none" | "low" | "moderate" | "high";
  loadConcernLevel: "none" | "low" | "moderate" | "high";
  // ── Indoor + Decel intelligence layers ─────────────────────────
  // Same severity ladder as loadConcernLevel — these get folded into
  // the same red/yellow gates so the dashboard verdict reflects the
  // intelligence views the coach can drill into. Without this wiring
  // a player flagged red on /coach/indoor-load or /coach/decel-
  // intelligence could still show GREEN on the dashboard.
  indoorCompositeBand?: "light" | "below_average" | "typical" | "heavy" | "spike" | null;
  indoorMcburnieFlag?: "green" | "yellow" | "red" | null;
  indoorAcwrFlag?: "green" | "yellow" | "red" | null;
  decelOverallFlag?: "green" | "yellow" | "red" | "unknown" | null;
}): AthleteState {
  if (args.hardBlock || args.rehab) return "RED";
  if (args.readinessState === "RED") return "RED";
  if (args.neuralStatus === "suppressed") return "RED";
  if (args.injurySeverity === "high" || args.loadConcernLevel === "high") return "RED";

  // RED gates from the intelligence layers.
  if (args.indoorCompositeBand === "spike") return "RED";
  if (args.indoorMcburnieFlag === "red") return "RED";
  if (args.indoorAcwrFlag === "red") return "RED";
  if (args.decelOverallFlag === "red") return "RED";

  if (
    args.readinessState === "YELLOW" ||
    args.neuralStatus === "caution" ||
    args.injurySeverity === "moderate" ||
    args.loadConcernLevel === "moderate"
  ) {
    return "YELLOW";
  }

  // YELLOW gates from the intelligence layers.
  if (args.indoorCompositeBand === "heavy") return "YELLOW";
  if (args.indoorMcburnieFlag === "yellow") return "YELLOW";
  if (args.indoorAcwrFlag === "yellow") return "YELLOW";
  if (args.decelOverallFlag === "yellow") return "YELLOW";

  return args.readinessState;
}

export function buildAthleteDecision(params: BuildAthleteDecisionParams): AthleteDecision {
  const snapshot = params.snapshot;
  const readinessState = params.readinessDecision?.athleteState ?? (snapshot.derived.hasManualData ? "YELLOW" : "GRAY");
  const hardBlock = params.hardBlock === true;
  const rehab = snapshot.context.rehab === true || snapshot.context.returnToPlay === true;
  const neuralStatus = params.neural?.status ?? "unknown";
  const injurySeverity =
    params.injuryDecision?.injuryRiskLevel === "HIGH"
      ? "high"
      : params.injuryDecision?.injuryRiskLevel === "MODERATE"
      ? "moderate"
      : params.injuryDecision?.injuryRiskLevel === "LOW"
      ? "low"
      : "none";
  const loadConcernLevel = params.load?.concernLevel ?? "none";
  const indoorCompositeBand = params.indoorLoad?.compositeBand ?? null;
  const indoorMcburnieFlag = params.indoorLoad?.mcburnieFlag ?? null;
  const indoorAcwrFlag = params.indoorLoad?.acwrFlag ?? null;
  const decelOverallFlag = params.decelIntelligence?.overallFlag ?? null;
  const whoopInfluenced =
    snapshot.derived.hasWhoopData &&
    (!!params.whoop?.explanationLine ||
      (params.readinessDecision?.riskFactors ?? []).some((factor) => factor.startsWith("whoop_")));
  const preliminaryState = inferAthleteState({
    hardBlock,
    rehab,
    readinessState,
    neuralStatus,
    injurySeverity,
    loadConcernLevel,
    indoorCompositeBand,
    indoorMcburnieFlag,
    indoorAcwrFlag,
    decelOverallFlag,
  });

  // ── Sequence-aware escalation ─────────────────────────────────────
  // Stateless single-day inference can't see chronic patterns. If a
  // player has been YELLOW for 3+ days running, that's a different
  // clinical state than "yellow once" and warrants RED. Sustained RED
  // (2+ days) doesn't change the state but tags it for guidance.
  // No-op when recentDecisions is null/empty (backwards compatible).
  const streakResult = applyStreakEscalation(
    preliminaryState,
    snapshot.date,
    params.recentDecisions ?? [],
  );
  const athleteState = streakResult.state;
  const streakContext = streakResult.context;

  const lowDataConfidence = snapshot.derived.overallSnapshotConfidence < 0.45;
  const sessionMode = deriveSessionMode({
    athleteState,
    rehab,
    hardBlock,
    explicitRecoveryDay: params.explicitRecoveryDay === true,
    insufficientData: lowDataConfidence,
  });
  const loadAction = deriveLoadAction({
    athleteState,
    hardBlock,
    injuryConcern: injurySeverity === "moderate" || injurySeverity === "high",
    neuralConcern: neuralStatus === "caution" || neuralStatus === "suppressed",
    loadConcernLevel,
    lowDataConfidence,
  });
  const decisionConfidence = Math.max(
    0,
    Math.min(
      1,
      snapshot.derived.overallSnapshotConfidence * 0.55 +
        mapReadinessConfidence(params.readinessDecision?.confidence) * 0.35 +
        (params.neural?.confidence ?? 0.5) * 0.05 +
        (params.whoop?.confidence ?? 0.5) * 0.05
    )
  );
  // Compose load summary lines: outdoor concern (existing) + indoor +
  // decel intelligence when any of those moved the verdict. Keeps the
  // Why text honest about which intelligence layer escalated the call.
  const loadSummaryParts: string[] = [];
  if (params.load?.summary) loadSummaryParts.push(params.load.summary);
  if (indoorCompositeBand === "spike") loadSummaryParts.push("Indoor composite is in SPIKE band — overload risk if sustained.");
  else if (indoorCompositeBand === "heavy") loadSummaryParts.push("Indoor composite in HEAVY band — match-style training load yesterday.");
  if (indoorMcburnieFlag === "red") loadSummaryParts.push("Indoor McBurnie ratio in RED — decel:intensity coupling significantly off.");
  else if (indoorMcburnieFlag === "yellow") loadSummaryParts.push("Indoor McBurnie ratio in YELLOW — decel:intensity coupling outside sweet spot.");
  if (indoorAcwrFlag === "red") loadSummaryParts.push("Indoor ACWR in RED — acute spike or severe undertraining (Gabbett 2017).");
  else if (indoorAcwrFlag === "yellow") loadSummaryParts.push("Indoor ACWR in YELLOW — outside 0.8–1.3 sweet spot.");
  if (decelOverallFlag === "red") loadSummaryParts.push(params.decelIntelligence?.summary ?? "Decel Intelligence (McBurnie 2022) overall flag RED — multiple deceleration dimensions out of safe range.");
  else if (decelOverallFlag === "yellow") loadSummaryParts.push(params.decelIntelligence?.summary ?? "Decel Intelligence (McBurnie 2022) overall flag YELLOW — at least one deceleration dimension elevated.");
  const loadSummaryCombined = loadSummaryParts.length ? loadSummaryParts.join(" ") : null;

  const baseReasons = buildDecisionReasons({
    hardBlock,
    rehab,
    readinessWhy: params.readinessDecision?.why,
    neuralSummary: params.neural?.summary ?? null,
    injurySummary:
      params.injuryDecision && params.injuryDecision.why.length
        ? params.injuryDecision.why[0]
        : params.injuryDecision
        ? `Injury risk remains ${params.injuryDecision.injuryRiskLevel.toLowerCase()}.`
        : null,
    loadSummary: loadSummaryCombined,
    whoopLine: whoopInfluenced ? params.whoop?.explanationLine ?? "WHOOP influenced confidence, but not the dominant constraint." : null,
    lowDataConfidence,
  });

  // Prepend a streak line when escalation fired so it reads as the
  // dominant cause of today's verdict (it overrode preliminaryState).
  const streakLine = describeStreakContext(streakContext, "EN");
  const reasons = streakResult.reasonCode || streakLine
    ? [
        ...(streakLine ? [streakLine] : []),
        ...baseReasons,
        ...(streakResult.reasonCode ? [streakResult.reasonCode] : []),
      ]
    : baseReasons;
  const explanationLines = buildDecisionExplanationLines({
    athleteState,
    sessionMode,
    reasons,
  });
  const recommendations = buildDecisionRecommendations({
    athleteState,
    loadAction,
    coachAction: params.readinessDecision?.coachAction,
    lowDataConfidence,
  });
  const flags = buildDecisionFlags({
    hardBlock,
    recoveryBias: sessionMode === "recovery",
    whoopInfluenced,
    loadConcernLevel,
    neuralStatus,
    injurySeverity,
    lowDataConfidence,
  });
  const trainingRecommendation = buildTrainingRecommendation(
    buildDecisionInputFromReadinessContext({
      athleteId: snapshot.athleteId,
      date: snapshot.date,
      readinessDecision: params.readinessDecision ?? null,
      injuryDecision: params.injuryDecision ?? null,
      lightAteState: readinessState,
      monitoringInput: {
        playerId: snapshot.athleteId,
        playerName: snapshot.athleteId,
        date: snapshot.date,
        readinessScore: params.readinessDecision?.score ?? undefined,
        checkinScore: params.readinessDecision?.supportingMetrics?.readinessScore ?? undefined,
        sleepScore: params.readinessDecision?.supportingMetrics?.sleepScore ?? undefined,
        sorenessScore: params.readinessDecision?.supportingMetrics?.sorenessScore ?? undefined,
        acuteLoad: params.readinessDecision?.supportingMetrics?.acuteLoad ?? undefined,
        chronicLoad: params.readinessDecision?.supportingMetrics?.chronicLoad ?? undefined,
        acwr: params.readinessDecision?.supportingMetrics?.acwr ?? undefined,
        lightAteState: readinessState,
        catapultDailyLoad: undefined,
      },
      snapshot,
      context: {
        sessionType: snapshot.context.expectedSessionType ?? null,
        phaseOfWeek: snapshot.context.weekSetupLabel ?? null,
        daysToMatch: null,
        daysSinceMatch: null,
        manuallyFlagged: hardBlock,
      },
    })
  );

  return {
    athleteId: snapshot.athleteId,
    date: snapshot.date,
    athleteState,
    sessionMode,
    loadAction,
    neuralStatus,
    readinessScore: params.readinessDecision?.score ?? null,
    decisionConfidence,
    flags,
    reasons,
    explanationLines,
    recommendations,
    sourceSummary: {
      manual: snapshot.derived.hasManualData,
      whoop: snapshot.derived.hasWhoopData,
      load: snapshot.derived.hasLoadData,
      neuromuscular: snapshot.derived.hasNeuromuscularData,
      context: snapshot.derived.hasContextData,
    },
    streakContext,
    engineContributions: {
      readiness: params.readinessDecision
        ? {
            score: params.readinessDecision.score ?? null,
            state: params.readinessDecision.athleteState,
            confidence: mapReadinessConfidence(params.readinessDecision.confidence),
          }
        : undefined,
      whoop: params.whoop
        ? {
            overallSupportScore: params.whoop.overallSupportScore ?? null,
            confidence: params.whoop.confidence ?? null,
          }
        : undefined,
      neural: params.neural
        ? {
            status: params.neural.status ?? null,
            confidence: params.neural.confidence ?? null,
          }
        : undefined,
      injury: {
        severity: injurySeverity,
      },
      load: {
        concernLevel: loadConcernLevel,
      },
    },
    trainingRecommendation,
  };
}
