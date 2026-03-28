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
};
