import "server-only";

import type { IntegrationProviderKey } from "@/lib/micropulse/integrations";
import { buildProviderAuthCallbackResult, validateProviderConnection } from "./auth";
import { loadProviderCredentialMetadata } from "./credentials";
import { buildConnectionRuntimeStatus, buildSyncHealthSummary } from "./health";
import { buildSyncHistoryEntry, saveSyncHistoryEntry } from "./history";
import { executePullSync } from "./pullSync";
import { saveConnectionRuntimeStatus, loadConnectionRuntimeStatuses, loadSyncJobs, loadWebhookEvents } from "./persistence";
import { createSyncJob } from "./syncJobs";
import { processWebhookEvent, registerWebhookEvent, verifyWebhookEvent } from "./webhooks";
import type { ProviderConnectionRuntimeStatus, SyncExecutionResult } from "./types";

/** Runs one provider pull sync and records job/history/runtime state. */
export async function runProviderSync(args: {
  provider: IntegrationProviderKey;
  connectionId?: string | null;
  triggerSource?: "SCHEDULE" | "MANUAL" | "BACKFILL";
  payloadOverride?: unknown;
}): Promise<SyncExecutionResult> {
  const credential = loadProviderCredentialMetadata(args.provider)[0];
  if (!credential) {
    const fallbackJob = createSyncJob({
      provider: args.provider,
      connectionId: args.connectionId ?? null,
      jobType: "MANUAL_SYNC",
      triggerSource: args.triggerSource ?? "MANUAL",
      summary: "No credential metadata found.",
    });
    const result: SyncExecutionResult = {
      jobId: fallbackJob.id,
      status: "FAILED",
      importedCount: 0,
      failedCount: 1,
      warnings: [],
      errors: ["No provider credential metadata found."],
      summary: "Sync failed due to missing credential metadata.",
    };
    saveSyncHistoryEntry(buildSyncHistoryEntry({ job: fallbackJob, result }));
    return result;
  }

  const job = createSyncJob({
    provider: args.provider,
    connectionId: args.connectionId ?? credential.id ?? null,
    organizationId: credential.organizationId ?? null,
    teamId: credential.teamId ?? null,
    jobType: args.triggerSource === "BACKFILL" ? "BACKFILL" : args.triggerSource === "SCHEDULE" ? "PULL_SYNC" : "MANUAL_SYNC",
    triggerSource: args.triggerSource ?? "MANUAL",
  });

  const result = await executePullSync({
    job,
    credential,
    payloadOverride: args.payloadOverride,
  });
  saveSyncHistoryEntry(buildSyncHistoryEntry({ job, result }));
  return result;
}

/** Scheduled sync wrapper with deterministic trigger-source metadata. */
export async function runScheduledSync(provider: IntegrationProviderKey): Promise<SyncExecutionResult> {
  return runProviderSync({ provider, triggerSource: "SCHEDULE" });
}

/** Processes incoming webhook through verification, job orchestration, ingestion, and audit logging. */
export async function processIncomingWebhook(args: {
  provider: IntegrationProviderKey;
  bodyRaw: string;
  payload: unknown;
  signature?: string | null;
  eventType?: string | null;
  deliveryId?: string | null;
  connectionId?: string | null;
  allowUnsigned?: boolean;
}): Promise<{ verification: ReturnType<typeof verifyWebhookEvent>; result: SyncExecutionResult }> {
  const verification = verifyWebhookEvent({
    provider: args.provider,
    bodyRaw: args.bodyRaw,
    signature: args.signature ?? null,
    allowUnsigned: args.allowUnsigned ?? false,
  });

  const event = registerWebhookEvent({
    provider: args.provider,
    connectionId: args.connectionId ?? null,
    verified: verification.verified,
    verificationSummary: verification.reason,
    eventType: args.eventType ?? null,
    deliveryId: args.deliveryId ?? null,
    summary: verification.verified ? "Webhook verified and queued for processing." : "Webhook rejected during verification.",
  });

  const job = createSyncJob({
    provider: args.provider,
    connectionId: args.connectionId ?? null,
    jobType: "WEBHOOK_PROCESS",
    triggerSource: "WEBHOOK",
  });

  const result = processWebhookEvent({
    job,
    event,
    payload: args.payload,
  });
  saveSyncHistoryEntry(buildSyncHistoryEntry({ job, result }));
  return { verification, result };
}

/** Rebuilds runtime status + global health summary from persisted live sync state. */
export function reconcileConnectionHealth(): { statuses: ProviderConnectionRuntimeStatus[]; summary: ReturnType<typeof buildSyncHealthSummary> } {
  const statuses = loadConnectionRuntimeStatuses();
  const jobs = loadSyncJobs();
  const webhooks = loadWebhookEvents();
  const summary = buildSyncHealthSummary({ statuses, jobs, webhookEvents: webhooks });
  return { statuses, summary };
}

/** Helper to refresh runtime for one provider from current credential and jobs. */
export function refreshProviderRuntimeStatus(provider: IntegrationProviderKey): ProviderConnectionRuntimeStatus {
  const credential = loadProviderCredentialMetadata(provider)[0] ?? null;
  const jobs = loadSyncJobs(provider);
  const runtime = buildConnectionRuntimeStatus({
    provider,
    credential,
    jobs,
    webhookEvents: loadWebhookEvents(provider),
    connectionId: credential?.id ?? null,
  });
  saveConnectionRuntimeStatus(runtime);
  return runtime;
}

/** OAuth callback convenience hook that updates credential lifecycle then runtime snapshot. */
export function finalizeProviderAuthCallback(args: {
  provider: IntegrationProviderKey;
  success: boolean;
  statusMessage?: string | null;
  expiresAt?: string | null;
  hasRefreshToken?: boolean;
}): ProviderConnectionRuntimeStatus {
  buildProviderAuthCallbackResult(args);
  return refreshProviderRuntimeStatus(args.provider);
}

/** Connection validity snapshot helper used by server handlers before sync execution. */
export function getProviderConnectionValidity(provider: IntegrationProviderKey) {
  return validateProviderConnection(provider);
}

