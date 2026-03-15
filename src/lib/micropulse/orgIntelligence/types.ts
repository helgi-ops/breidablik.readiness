export type OrgRoleView = "EXECUTIVE" | "MEDICAL" | "PERFORMANCE" | "COACHING" | "ADMIN";

export type OrgTeamSnapshot = {
  teamId: string;
  teamName: string;
  teamType?: string | null;
  athleteCount?: number | null;

  averageReadinessScore?: number | null;
  averageInjuryRiskScore?: number | null;
  averagePerformanceScore?: number | null;
  averageLoadToleranceScore?: number | null;
  averageCollapseRiskScore?: number | null;

  highRiskCount?: number | null;
  criticalRiskCount?: number | null;
  recoveryCount?: number | null;
  modifiedCount?: number | null;
  fullCount?: number | null;
  holdCount?: number | null;

  generatedDraftCount?: number | null;
  inReviewCount?: number | null;
  approvedCount?: number | null;
  publishedCount?: number | null;
  assignedCount?: number | null;
  completedCount?: number | null;
  missedCount?: number | null;

  pendingReviewCount?: number | null;
  protectedPlayerCount?: number | null;
  unstablePlayerCount?: number | null;
  peakWindowCount?: number | null;
  completionRate?: number | null;

  summaryText?: string | null;
};

export type OrganizationSummary = {
  organizationId?: string;
  organizationName?: string;
  totalTeams: number;
  totalAthletes?: number | null;
  teamSnapshots: OrgTeamSnapshot[];

  averageReadinessScore?: number | null;
  averageInjuryRiskScore?: number | null;
  averagePerformanceScore?: number | null;
  averageLoadToleranceScore?: number | null;
  averageCollapseRiskScore?: number | null;

  totalHighRisk?: number | null;
  totalCriticalRisk?: number | null;
  totalRecovery?: number | null;
  totalModified?: number | null;
  totalFull?: number | null;
  totalHold?: number | null;
  totalPendingReviews?: number | null;
  totalPublished?: number | null;
  totalCompleted?: number | null;

  orgAttentionCount?: number | null;
  deliveryCompletionRate?: number | null;
  summaryText: string;
};

export type TeamComparisonMetricKey =
  | "READINESS"
  | "INJURY_RISK"
  | "PERFORMANCE"
  | "LOAD_TOLERANCE"
  | "COLLAPSE_RISK"
  | "COMPLETION_RATE"
  | "PENDING_REVIEWS"
  | "HIGH_RISK_COUNT"
  | "RECOVERY_COUNT";

export type TeamComparisonRow = {
  teamId: string;
  teamName: string;
  metricValues: Record<string, number | null>;
  comparisonSummary?: string | null;
};

export type OrgPolicyScope = "ORGANIZATION" | "TEAM";

export type OrgPolicyInheritanceDecision = {
  organizationDefaultsApplied: string[];
  teamOverridesApplied: string[];
  unresolvedConflicts: string[];
  summary: string;
};

export type MedicalOverviewSummary = {
  totalHighRiskPlayers: number;
  totalCriticalRiskPlayers: number;
  totalRecoveryRecommended: number;
  teamsMostInNeedOfReview: Array<{ teamId: string; teamName: string; pendingReviewCount: number }>;
  summaryText: string;
};

export type PerformanceOverviewSummary = {
  teamsWithHighestPeakWindowCount: Array<{ teamId: string; teamName: string; peakWindowCount: number }>;
  teamsWithHighestInstabilityCount: Array<{ teamId: string; teamName: string; unstablePlayerCount: number }>;
  teamsWithHighestModifiedLoad: Array<{ teamId: string; teamName: string; modifiedLoadCount: number }>;
  summaryText: string;
};

export type ExecutiveSummary = {
  organizationName?: string;
  topSummaryLine: string;
  keyPoints: string[];
  risks: string[];
  positives: string[];
  actionItems: string[];
};

export type OrgAttentionItem = {
  id: string;
  teamId?: string | null;
  teamName?: string | null;
  category: "RISK" | "WORKFLOW" | "DELIVERY" | "POLICY" | "STAFF";
  severity: "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
  title: string;
  summary: string;
  relatedPlayerIds?: string[];
  relatedWorkflowIds?: string[];
};

export type OrgAttentionQueueSummary = {
  items: OrgAttentionItem[];
  countsBySeverity: Record<string, number>;
  summaryText: string;
};

export type OrgReportingView = {
  organizationSummary: OrganizationSummary;
  medicalOverview: MedicalOverviewSummary;
  performanceOverview: PerformanceOverviewSummary;
  executiveSummary: ExecutiveSummary;
  attentionQueue: OrgAttentionQueueSummary;
  teamComparisonRows: TeamComparisonRow[];
  policyInheritanceByTeam: Record<string, OrgPolicyInheritanceDecision>;
};

export type RoleSpecificOrgView = {
  role: OrgRoleView;
  organizationSummary: OrganizationSummary;
  executiveSummary: ExecutiveSummary;
  medicalOverview?: MedicalOverviewSummary;
  performanceOverview?: PerformanceOverviewSummary;
  attentionQueue: OrgAttentionQueueSummary;
  teamComparisonRows: TeamComparisonRow[];
  policyInheritanceByTeam?: Record<string, OrgPolicyInheritanceDecision>;
};
