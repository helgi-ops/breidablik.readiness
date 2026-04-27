export type TeamDecisionCounts = {
  green: number;
  yellow: number;
  red: number;
  gray: number;
  total: number;
};

export type TeamStatusOverviewData = {
  counts: TeamDecisionCounts;
  readinessDistributionPct: {
    green: number;
    yellow: number;
    red: number;
    gray: number;
  };
  averageReadinessScore: number | null;
  playersWithRiskFlags: number;
  playersModified: number;
  playersRecoveryOnly: number;
  playersPendingReview: number;
};

export type TeamAlertSeverity = "info" | "warning" | "critical";

export type TeamAlert = {
  id: string;
  severity: TeamAlertSeverity;
  title: string;
  description: string;
  count?: number;
  playerIds?: string[];
  playerNames?: string[];
  flags?: string[];
};

export type TeamRecommendation = {
  teamMode: "full_go" | "train_with_modifications" | "recovery_bias" | "manual_review";
  loadAdjustmentSuggestion: number | null;
  summary: string;
  rationale: string[];
  recommendedConstraints: string[];
  playersNeedingModification: number;
  playersRecoveryOnly: number;
};

export type PlayerDecisionListItem = {
  athleteId: string;
  athleteName: string;
  state: "GREEN" | "YELLOW" | "RED" | "GRAY";
  sessionMode: "full" | "modified" | "recovery" | "pending";
  loadAdjustment: number | null;
  topFlags: string[];
  coachSummary: string;
  confidenceScore: number;
  confidenceBand: "low" | "medium" | "high";
  explanationFactors: {
    key: string;
    label: string;
    value?: string | number | null;
    impactScore: number;
    direction: "positive" | "negative" | "neutral";
    summary: string;
  }[];
  constraints: string[];
  focus: string[];
  riskFlags: string[];
  /** True when a CMJ test is recommended before training today */
  cmjRequired?: boolean;
  /**
   * Coach-facing load escalation alerts — explains WHY loadConcern was raised.
   * Empty when load concern is "none". Displayed as alert badges in the row.
   */
  loadAlerts?: string[];
  /**
   * Composite fatigue classification when both MLI and Metabolic data available.
   */
  fatigueType?: "global_fatigue" | "mechanical_fatigue" | "metabolic_fatigue" | "normal" | null;
};

export type TeamDecisionResponse = {
  date: string;
  generatedAt: string;
  teamStatusOverview: TeamStatusOverviewData;
  alerts: TeamAlert[];
  teamRecommendation: TeamRecommendation;
  players: PlayerDecisionListItem[];
};

export type CoachCommandPlayerSource = {
  athleteId: string;
  athleteName: string;
  readinessScore?: number | null;
  /** True when a CMJ test is recommended before training today */
  cmjRequired?: boolean;
  /** Coach-facing load escalation alerts */
  loadAlerts?: string[];
  /** Composite fatigue classification */
  fatigueType?: "global_fatigue" | "mechanical_fatigue" | "metabolic_fatigue" | "normal" | null;
  recommendation: {
    state: "GREEN" | "YELLOW" | "RED" | "GRAY";
    sessionMode: "full" | "modified" | "recovery" | "pending";
    loadAdjustment: number | null;
    constraints: string[];
    focus: string[];
    riskFlags: string[];
    explanationFactors: {
      key: string;
      label: string;
      value?: string | number | null;
      impactScore: number;
      direction: "positive" | "negative" | "neutral";
      summary: string;
    }[];
    confidence: {
      score: number;
      band: "low" | "medium" | "high";
    };
    coachSummary: string;
    dataQuality: {
      requiresManualReview: boolean;
    };
  };
  /**
   * Counterfactual "what-if" alternatives for today's verdict. Up to 3
   * single-lever flips that would have improved the verdict (e.g. "If
   * indoor composite had been TYPICAL → YELLOW not RED"). Empty array
   * for GREEN/GRAY verdicts or when no single-lever flip helps. The
   * field is always present so consumers can rely on it being there.
   * See src/lib/micropulse/domain/decision/counterfactuals.ts for the
   * full Counterfactual type definition.
   */
  counterfactuals?: Array<{
    signal:
      | "readiness"
      | "neural"
      | "injury"
      | "load"
      | "indoor_composite"
      | "indoor_mcburnie"
      | "indoor_acwr"
      | "decel"
      | "streak";
    currentValue: string;
    hypotheticalValue: string;
    hypotheticalState: "GREEN" | "YELLOW" | "RED" | "GRAY";
    impact: 1 | 2 | 3;
    descriptionEN: string;
    descriptionIS: string;
  }>;
  /**
   * Streak context — chronic-pattern view of today vs. recent days.
   * Set by the decision engine when recentDecisions are passed in.
   * Null when sequence escalation didn't run (e.g. dashboard client-
   * side path that doesn't fetch decision history).
   */
  streakContext?: {
    consecutiveYellow: number;
    consecutiveRed: number;
    daysOfYellowOrRed: number;
    daysSinceGreen: number | null;
    escalationApplied: "none" | "yellow_streak_to_red" | "red_streak_sustained";
  } | null;
};
