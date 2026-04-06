import type { CoachRule, FinalRecommendationDecision } from "@/lib/micropulse/rulesEngine";
import { DEFAULT_TEAM_POLICY_CONFIG, DEFAULT_MATCHDAY_TEMPLATE_CONFIGS } from "./defaultPolicies";
import {
  buildRulesFromMatchdayTemplate,
  buildRulesFromProtectedPlayerConfig,
  buildRulesFromTeamPolicy,
} from "./policyMapping";
import type {
  AdminConfigSnapshot,
  AdminSystemSummary,
  MatchdayTemplateConfig,
  OverrideHistoryItem,
  ProtectedPlayerConfig,
  RecommendationAuditView,
  TeamPolicyConfig,
} from "./types";

// Persistence boundary: replace localStorage with API/DB reads/writes when admin persistence is introduced.
export const ADMIN_CONFIG_STORAGE_KEY = "micropulse.adminConfig.v1";

export function createDefaultAdminConfigSnapshot(): AdminConfigSnapshot {
  return {
    rules: [],
    protectedPlayers: [],
    teamPolicy: DEFAULT_TEAM_POLICY_CONFIG,
    matchdayTemplates: DEFAULT_MATCHDAY_TEMPLATE_CONFIGS,
    overrideHistory: [],
  };
}

function safeParse(json: string | null): unknown {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function loadAdminConfigSnapshotFromStorage(): AdminConfigSnapshot {
  if (typeof window === "undefined") return createDefaultAdminConfigSnapshot();
  const parsed = safeParse(window.localStorage.getItem(ADMIN_CONFIG_STORAGE_KEY)) as Partial<AdminConfigSnapshot> | null;
  if (!parsed) return createDefaultAdminConfigSnapshot();

  return {
    rules: Array.isArray(parsed.rules) ? (parsed.rules as CoachRule[]) : [],
    protectedPlayers: Array.isArray(parsed.protectedPlayers) ? (parsed.protectedPlayers as ProtectedPlayerConfig[]) : [],
    teamPolicy: (parsed.teamPolicy as TeamPolicyConfig) ?? DEFAULT_TEAM_POLICY_CONFIG,
    matchdayTemplates: Array.isArray(parsed.matchdayTemplates)
      ? (parsed.matchdayTemplates as MatchdayTemplateConfig[])
      : DEFAULT_MATCHDAY_TEMPLATE_CONFIGS,
    overrideHistory: Array.isArray(parsed.overrideHistory) ? (parsed.overrideHistory as OverrideHistoryItem[]) : [],
  };
}

export function saveAdminConfigSnapshotToStorage(snapshot: AdminConfigSnapshot): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ADMIN_CONFIG_STORAGE_KEY, JSON.stringify(snapshot));
}

export function buildRuntimeRulesFromAdminConfig(snapshot: AdminConfigSnapshot): CoachRule[] {
  const generated: CoachRule[] = [];
  generated.push(...buildRulesFromTeamPolicy(snapshot.teamPolicy));
  for (const p of snapshot.protectedPlayers) generated.push(...buildRulesFromProtectedPlayerConfig(p));
  for (const t of snapshot.matchdayTemplates) generated.push(...buildRulesFromMatchdayTemplate(t));

  return [...generated, ...snapshot.rules]
    .filter((r) => r.enabled)
    .sort((a, b) => b.priority - a.priority);
}

export function isPlayerProtectedByAdminConfig(snapshot: AdminConfigSnapshot, playerId: string): boolean {
  return snapshot.protectedPlayers.some((p) => p.enabled && p.playerId === playerId);
}

export function getProtectedPlayerTags(snapshot: AdminConfigSnapshot, playerId: string): string[] {
  const entry = snapshot.protectedPlayers.find((p) => p.enabled && p.playerId === playerId);
  return entry ? Array.from(new Set(entry.tags)) : [];
}

export function upsertOverrideHistoryItem(
  snapshot: AdminConfigSnapshot,
  item: OverrideHistoryItem,
): AdminConfigSnapshot {
  const overrideHistory = [item, ...snapshot.overrideHistory.filter((h) => h.id !== item.id)].slice(0, 500);
  return { ...snapshot, overrideHistory };
}

export function buildRecommendationAuditView(args: {
  playerId?: string;
  playerName?: string;
  date?: string;
  decision: FinalRecommendationDecision;
}): RecommendationAuditView {
  return {
    playerId: args.playerId,
    playerName: args.playerName,
    date: args.date,
    engineRecommendation: args.decision.engineRecommendation,
    finalRecommendation: args.decision.finalRecommendation,
    appliedRules: args.decision.appliedRules,
    manualOverride: args.decision.manualOverride,
    requiresCoachReview: args.decision.requiresCoachReview,
    overrideSummary: args.decision.overrideSummary,
  };
}

export function buildAdminSystemSummary(args: {
  snapshot: AdminConfigSnapshot;
  recommendationDecisions?: FinalRecommendationDecision[];
}): AdminSystemSummary {
  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 7);

  const overridesTodayCount = args.snapshot.overrideHistory.filter((h) => new Date(h.timestamp) >= dayStart).length;
  const overridesThisWeekCount = args.snapshot.overrideHistory.filter((h) => new Date(h.timestamp) >= weekStart).length;
  const reviewRequiredCount = (args.recommendationDecisions ?? []).filter((d) => d.requiresCoachReview).length;

  return {
    activeRuleCount: buildRuntimeRulesFromAdminConfig(args.snapshot).length,
    protectedPlayerCount: args.snapshot.protectedPlayers.filter((p) => p.enabled).length,
    reviewRequiredCount,
    overridesTodayCount,
    overridesThisWeekCount,
    summaryText: `${buildRuntimeRulesFromAdminConfig(args.snapshot).length} active rules, ${reviewRequiredCount} players require review today.`,
  };
}

export * from "./types";
export * from "./defaultPolicies";
export * from "./ruleFormMapping";
export * from "./policyMapping";
export * from "./validation";
