import { buildChannelSubscriptionKey, getChannelScopeSummary } from "./channels";
import type { RealtimeSubscriptionRequest } from "./types";

/** Validates subscription request for safe scoped realtime consumption. */
export function validateRealtimeSubscriptionRequest(request: RealtimeSubscriptionRequest): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!request.channel) errors.push("Missing channel.");
  if (request.channel === "PLAYER_DETAIL" && !request.playerId) errors.push("PLAYER_DETAIL requires playerId.");
  if (request.channel === "WORKFLOW_EVENTS" && !request.teamId && !request.workflowId) errors.push("WORKFLOW_EVENTS requires teamId or workflowId.");
  if (request.channel === "TEAM_OPERATIONS" && !request.teamId) errors.push("TEAM_OPERATIONS requires teamId.");
  if (request.role && request.role.trim().length < 2) errors.push("role must be at least 2 chars when provided.");
  return { valid: errors.length === 0, errors };
}

/** Normalizes subscription data into stable key + validated request object. */
export function buildRealtimeSubscription(request: RealtimeSubscriptionRequest): { key: string; request: RealtimeSubscriptionRequest; summary: string } {
  const normalized: RealtimeSubscriptionRequest = {
    ...request,
    organizationId: request.organizationId ?? null,
    teamId: request.teamId ?? null,
    playerId: request.playerId ?? null,
    workflowId: request.workflowId ?? null,
    role: request.role ?? null,
  };
  return {
    key: buildChannelSubscriptionKey(normalized),
    request: normalized,
    summary: getChannelScopeSummary(normalized),
  };
}

/** Human-readable subscription summary for connection status banners/panels. */
export function summarizeSubscription(request: RealtimeSubscriptionRequest): string {
  const built = buildRealtimeSubscription(request);
  return built.summary;
}

