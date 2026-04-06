import type { RealtimeDomainEvent, RealtimeSubscriptionRequest } from "./types";

/** Builds stable channel key from scoped subscription request. */
export function buildChannelSubscriptionKey(request: RealtimeSubscriptionRequest): string {
  return [
    request.channel,
    request.organizationId ?? "org:*",
    request.teamId ?? "team:*",
    request.playerId ?? "player:*",
    request.workflowId ?? "workflow:*",
  ].join("::");
}

/** Readable scope summary for debugging and activity diagnostics. */
export function getChannelScopeSummary(request: RealtimeSubscriptionRequest): string {
  return `${request.channel} [org=${request.organizationId ?? "*"} team=${request.teamId ?? "*"} player=${request.playerId ?? "*"} workflow=${request.workflowId ?? "*"}]`;
}

/** Deterministic event routing rules by channel/scope fields. */
export function canEventFlowToChannel(event: RealtimeDomainEvent, request: RealtimeSubscriptionRequest): boolean {
  if (request.organizationId && event.organizationId && request.organizationId !== event.organizationId) return false;
  if (request.teamId && event.teamId && request.teamId !== event.teamId) return false;
  if (request.playerId && event.playerId && request.playerId !== event.playerId) return false;
  if (request.workflowId && event.workflowId && request.workflowId !== event.workflowId) return false;

  switch (request.channel) {
    case "TEAM_OPERATIONS":
      return Boolean(event.teamId) && event.type !== "INTEGRATION_IMPORT_FAILED" && event.scopeType !== "ORGANIZATION";
    case "PLAYER_DETAIL":
      return Boolean(event.playerId) || event.scopeType === "PLAYER";
    case "ORG_OVERVIEW":
      return event.scopeType === "ORGANIZATION" || Boolean(event.organizationId) || Boolean(event.teamId);
    case "WORKFLOW_EVENTS":
      return Boolean(event.workflowId) || event.type.includes("SESSION_") || event.type.includes("REVIEW_REQUEST");
    case "INTEGRATION_HEALTH":
      return event.scopeType === "INTEGRATION" || event.type.includes("INTEGRATION_") || event.type.includes("SYNC_JOB") || event.type.includes("WEBHOOK");
    default:
      return false;
  }
}
