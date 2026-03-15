import "server-only";

import { ingestRawIntegrationPayload, type IntegrationImportMode, type IntegrationProviderKey } from "@/lib/micropulse/integrations";
import type { ProviderCredentialRecord, SyncExecutionResult, SyncJobRecord } from "./types";
import { validateProviderConnection } from "./auth";
import { finalizeSyncJob, updateSyncJobStatus } from "./syncJobs";
import { buildDefaultRetryPolicy, computeNextRetryAt, shouldRetrySyncJob } from "./retry";
import { saveConnectionRuntimeStatus } from "./persistence";
import { buildConnectionRuntimeStatus } from "./health";

export type ProviderPullTransport = (args: {
  provider: IntegrationProviderKey;
  credential: ProviderCredentialRecord;
  connectionId?: string | null;
}) => Promise<{ payload: unknown; sourceRef?: string | null }>;

/** Builds pull-sync execution plan from provider connection and trigger context. */
export function buildPullSyncPlan(args: {
  provider: IntegrationProviderKey;
  connectionId?: string | null;
  importMode?: IntegrationImportMode;
  triggerSource: SyncJobRecord["triggerSource"];
}): { provider: IntegrationProviderKey; connectionId?: string | null; importMode: IntegrationImportMode; triggerSource: SyncJobRecord["triggerSource"] } {
  return {
    provider: args.provider,
    connectionId: args.connectionId ?? null,
    importMode: args.importMode ?? "API_PULL",
    triggerSource: args.triggerSource,
  };
}

/** Executes a pull sync through transport -> Phase 13 ingestion -> sync job finalization. */
export async function executePullSync(args: {
  job: SyncJobRecord;
  credential: ProviderCredentialRecord;
  transport?: ProviderPullTransport;
  payloadOverride?: unknown;
}): Promise<SyncExecutionResult> {
  const connectionValidation = validateProviderConnection(args.job.provider);
  if (!connectionValidation.valid) {
    const failedJob = finalizeSyncJob({
      job: args.job,
      status: "FAILED",
      summary: `Sync failed: ${connectionValidation.summary}`,
      errorMessage: connectionValidation.summary,
    });
    saveConnectionRuntimeStatus(
      buildConnectionRuntimeStatus({
        provider: failedJob.provider,
        connectionId: failedJob.connectionId,
        credential: args.credential,
        jobs: [failedJob],
      }),
    );
    return {
      jobId: failedJob.id,
      status: failedJob.status,
      importedCount: 0,
      failedCount: 1,
      warnings: [],
      errors: [connectionValidation.summary],
      summary: failedJob.summary,
    };
  }

  const running = updateSyncJobStatus(args.job, "RUNNING");

  try {
    let pulled: { payload: unknown; sourceRef?: string | null };
    if (args.payloadOverride != null) {
      pulled = { payload: args.payloadOverride, sourceRef: `manual:${running.id}` };
    } else if (args.transport) {
      pulled = await args.transport({
        provider: running.provider,
        credential: args.credential,
        connectionId: running.connectionId,
      });
    } else {
      throw new Error("Provider transport is not wired for this environment.");
    }

    const ingested = ingestRawIntegrationPayload({
      provider: running.provider,
      payload: pulled.payload,
      importMode: "API_PULL",
      connectionId: running.connectionId,
      sourceRef: pulled.sourceRef ?? `pull:${running.id}`,
    });

    const nextStatus = ingested.record.status === "SUCCESS" ? "SUCCESS" : ingested.record.status === "PARTIAL" ? "PARTIAL" : "FAILED";
    const finalized = finalizeSyncJob({
      job: running,
      status: nextStatus,
      summary: `Pull sync ${nextStatus.toLowerCase()}: ${ingested.record.summary}`,
      importRecordId: ingested.record.id,
      payloadReferenceId: ingested.rawPayload.id,
      errorMessage: ingested.record.errors.join(" | ") || null,
    });

    saveConnectionRuntimeStatus(
      buildConnectionRuntimeStatus({
        provider: finalized.provider,
        connectionId: finalized.connectionId,
        credential: args.credential,
        jobs: [finalized],
      }),
    );

    return {
      jobId: finalized.id,
      status: finalized.status,
      importedCount: ingested.record.importedCount,
      failedCount: ingested.record.failedCount,
      warnings: ingested.record.warnings,
      errors: ingested.record.errors,
      summary: finalized.summary,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown provider pull error.";
    const failed = finalizeSyncJob({
      job: running,
      status: "FAILED",
      summary: `Pull sync failed: ${message}`,
      errorMessage: message,
    });
    const retryPolicy = buildDefaultRetryPolicy();
    const retry = shouldRetrySyncJob(failed, retryPolicy, message);
    const retryAt = retry
      ? computeNextRetryAt({
          attemptCount: failed.attemptCount,
          baseDelaySeconds: retryPolicy.baseDelaySeconds,
          backoffMultiplier: retryPolicy.backoffMultiplier,
        })
      : null;
    const retried = retry
      ? finalizeSyncJob({
          job: failed,
          status: "RETRYING",
          summary: `Retry scheduled after provider pull failure: ${message}`,
          errorMessage: message,
          retryAt,
        })
      : failed;

    saveConnectionRuntimeStatus(
      buildConnectionRuntimeStatus({
        provider: retried.provider,
        connectionId: retried.connectionId,
        credential: args.credential,
        jobs: [retried],
      }),
    );

    return {
      jobId: retried.id,
      status: retried.status,
      importedCount: 0,
      failedCount: 1,
      warnings: [],
      errors: [message],
      summary: retried.summary,
    };
  }
}

/** Short summary helper for pull-sync execution results. */
export function summarizePullSyncResult(result: SyncExecutionResult): string {
  return `${result.status}: ${result.importedCount} imported, ${result.failedCount} failed. ${result.summary}`;
}
