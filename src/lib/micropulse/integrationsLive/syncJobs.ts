import "server-only";

import type { IntegrationProviderKey } from "@/lib/micropulse/integrations";
import type { SyncJobRecord, SyncJobStatus, SyncJobType } from "./types";
import { saveSyncJob } from "./persistence";
import { buildSyncJobUpdatedEvent, publishRealtimeEvent } from "@/lib/micropulse/realtime";

/** Creates a sync job record for pull/webhook/manual execution orchestration. */
export function createSyncJob(args: {
  provider: IntegrationProviderKey;
  connectionId?: string | null;
  organizationId?: string | null;
  teamId?: string | null;
  jobType: SyncJobType;
  triggerSource: SyncJobRecord["triggerSource"];
  maxAttempts?: number;
  summary?: string;
}): SyncJobRecord {
  const job: SyncJobRecord = {
    id: `sync:${args.provider.toLowerCase()}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    provider: args.provider,
    connectionId: args.connectionId ?? null,
    organizationId: args.organizationId ?? null,
    teamId: args.teamId ?? null,
    jobType: args.jobType,
    status: "QUEUED",
    startedAt: new Date().toISOString(),
    completedAt: null,
    attemptCount: 0,
    maxAttempts: args.maxAttempts ?? 3,
    triggerSource: args.triggerSource,
    payloadReferenceId: null,
    importRecordId: null,
    summary: args.summary ?? `${args.jobType} queued.`,
    errorMessage: null,
    retryAt: null,
  };
  return saveSyncJob(job);
}

/** Updates sync job status in a single deterministic transition. */
export function updateSyncJobStatus(job: SyncJobRecord, status: SyncJobStatus, patch?: Partial<SyncJobRecord>): SyncJobRecord {
  const next: SyncJobRecord = {
    ...job,
    ...patch,
    status,
    attemptCount: status === "RUNNING" || status === "RETRYING" ? (patch?.attemptCount ?? job.attemptCount + 1) : (patch?.attemptCount ?? job.attemptCount),
    completedAt: status === "SUCCESS" || status === "PARTIAL" || status === "FAILED" || status === "CANCELLED" ? new Date().toISOString() : null,
  };
  const saved = saveSyncJob(next);
  publishRealtimeEvent(
    buildSyncJobUpdatedEvent({
      provider: saved.provider,
      summary: `${saved.provider} sync job ${saved.status.toLowerCase()}.`,
      payload: {
        jobId: saved.id,
        status: saved.status,
        attemptCount: saved.attemptCount,
      },
      severity: saved.status === "FAILED" ? "WARNING" : saved.status === "RETRYING" ? "NOTICE" : "INFO",
    }),
  );
  return saved;
}

/** Finalizes sync job with end-state summary and optional import/error references. */
export function finalizeSyncJob(args: {
  job: SyncJobRecord;
  status: SyncJobStatus;
  summary: string;
  importRecordId?: string | null;
  payloadReferenceId?: string | null;
  errorMessage?: string | null;
  retryAt?: string | null;
}): SyncJobRecord {
  return updateSyncJobStatus(args.job, args.status, {
    summary: args.summary,
    importRecordId: args.importRecordId ?? args.job.importRecordId,
    payloadReferenceId: args.payloadReferenceId ?? args.job.payloadReferenceId,
    errorMessage: args.errorMessage ?? null,
    retryAt: args.retryAt ?? null,
  });
}

/** Returns concise sync job status line for history and ops surfaces. */
export function summarizeSyncJob(job: SyncJobRecord): string {
  return `${job.provider} ${job.jobType.toLowerCase()} ${job.status.toLowerCase()} (attempt ${job.attemptCount}/${job.maxAttempts}).`;
}

/** Retryable job decision based on status and attempt counts. */
export function isSyncJobRetryable(job: SyncJobRecord): boolean {
  if (job.status !== "FAILED" && job.status !== "PARTIAL") return false;
  return job.attemptCount < job.maxAttempts;
}
