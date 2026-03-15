export type AutomationTriggerType = "DOMAIN_EVENT" | "SCHEDULED_CHECK" | "STATE_THRESHOLD";

export type AutomationScope = "PLAYER" | "TEAM" | "ORGANIZATION" | "WORKFLOW" | "INTEGRATION";

export type SmartAlertSeverity = "INFO" | "NOTICE" | "WARNING" | "HIGH" | "CRITICAL";

export type AutomationActionType =
  | "CREATE_ALERT"
  | "CREATE_REVIEW_REQUEST"
  | "SEND_NOTIFICATION"
  | "GENERATE_REPORT"
  | "OPEN_ESCALATION"
  | "ADD_ACTIVITY_ITEM"
  | "FLAG_FOR_ATTENTION"
  | "REQUEST_MANUAL_CONFIRMATION";

export type AutomationRuleStatus = "ENABLED" | "DISABLED";

export type AutomationRuleCondition = {
  field: string;
  operator: "EQ" | "NEQ" | "GT" | "GTE" | "LT" | "LTE" | "IN" | "NOT_IN" | "CONTAINS" | "TRUE" | "FALSE";
  value?: string | number | boolean | string[] | number[] | null;
};

export type AutomationRuleAction = {
  type: AutomationActionType;
  config?: Record<string, unknown> | null;
};

export type AutomationRule = {
  id: string;
  name: string;
  description?: string | null;
  status: AutomationRuleStatus;
  triggerType: AutomationTriggerType;
  scope: AutomationScope;
  eventTypes?: string[];
  conditions: AutomationRuleCondition[];
  actions: AutomationRuleAction[];
  priority: number;
  cooldownMinutes?: number | null;
  requiresHumanReview?: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type SmartAlertRecord = {
  id: string;
  scope: AutomationScope;
  scopeId?: string | null;
  teamId?: string | null;
  organizationId?: string | null;
  playerId?: string | null;
  severity: SmartAlertSeverity;
  title: string;
  summary: string;
  sourceEventId?: string | null;
  sourceRuleId?: string | null;
  status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED" | "SUPPRESSED";
  createdAt?: string | null;
  acknowledgedAt?: string | null;
  resolvedAt?: string | null;
  dedupeKey?: string | null;
  cooldownUntil?: string | null;
};

export type AutomationActionExecutionRecord = {
  id: string;
  ruleId?: string | null;
  sourceEventId?: string | null;
  actionType: AutomationActionType;
  status: "PENDING" | "EXECUTED" | "SKIPPED" | "FAILED" | "AWAITING_REVIEW";
  summary: string;
  createdAt?: string | null;
  executedAt?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type EscalationRecord = {
  id: string;
  sourceAlertId?: string | null;
  scope: AutomationScope;
  scopeId?: string | null;
  level: 1 | 2 | 3;
  status: "OPEN" | "ESCALATED" | "CLOSED";
  title: string;
  summary: string;
  createdAt?: string | null;
  escalatedAt?: string | null;
  closedAt?: string | null;
  reason?: string | null;
};

export type AutomationEvaluationResult = {
  matchedRules: AutomationRule[];
  alertsToCreate: SmartAlertRecord[];
  actionsToExecute: AutomationActionExecutionRecord[];
  escalationCandidates: EscalationRecord[];
  summary: string;
};

export type AutomationSummary = {
  openAlerts: number;
  criticalAlerts: number;
  escalationsOpen: number;
  actionsExecutedToday: number;
  suppressedAlerts: number;
  summaryText: string;
};

export type AutomationHistoryEntry = {
  id: string;
  timestamp?: string | null;
  sourceEventId?: string | null;
  ruleId?: string | null;
  actionId?: string | null;
  alertId?: string | null;
  escalationId?: string | null;
  summary: string;
};

