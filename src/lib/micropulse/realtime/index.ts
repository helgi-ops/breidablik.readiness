export type {
  RealtimeDomainEventType,
  RealtimeScopeType,
  RealtimeChannelKey,
  RealtimeDomainEvent,
  RealtimeSubscriptionRequest,
  RealtimeConnectionState,
  RealtimeActivityItem,
  RealtimeUiUpdate,
  RealtimeHealthSummary,
} from "./types";

export {
  buildRealtimeDomainEvent,
  buildPlayerReadinessUpdatedEvent,
  buildPlayerRiskUpdatedEvent,
  buildSessionPublishedEvent,
  buildPlayerSessionCompletedEvent,
  buildReviewRequestOpenedEvent,
  buildIntegrationImportCompletedEvent,
  buildSyncJobUpdatedEvent,
  buildWorkflowStatusChangedEvent,
} from "./events";

export { buildChannelSubscriptionKey, getChannelScopeSummary, canEventFlowToChannel } from "./channels";
export { validateRealtimeSubscriptionRequest, buildRealtimeSubscription, summarizeSubscription } from "./subscriptions";

export {
  publishRealtimeEvent,
  subscribeToRealtimeChannel,
  unsubscribeFromRealtimeChannel,
  handleIncomingRealtimeEvent,
  getRealtimeStreamEventName,
} from "./stream";

export { shouldDedupeEvent, buildEventDedupeKey, filterDuplicateEvents } from "./dedupe";
export { shouldThrottleUiUpdate, coalesceRealtimeUiUpdates, summarizeCoalescedUpdate } from "./throttle";
export { mapRealtimeEventToUiUpdates, mapEventToActivityItem, summarizeRealtimeImpact } from "./uiMapping";
export { buildRealtimeActivityItem, groupRealtimeActivityItems, summarizeRecentActivity } from "./activity";

export {
  saveRealtimeEvent,
  loadRecentRealtimeEvents,
  saveRealtimeActivityItem,
  loadRecentActivityItems,
  saveRealtimeHealthSummary,
  loadRealtimeHealthSummary,
} from "./persistence";

export { useTeamRealtime, usePlayerRealtime, useWorkflowRealtime, useIntegrationRealtime } from "./hooks";

