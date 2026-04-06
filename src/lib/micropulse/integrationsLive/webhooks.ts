import "server-only";

import crypto from "node:crypto";
import { ingestRawIntegrationPayload, type IntegrationProviderKey } from "@/lib/micropulse/integrations";
import type { SyncExecutionResult, SyncJobRecord, WebhookEventRecord, WebhookVerificationResult } from "./types";
import { saveWebhookEvent } from "./persistence";
import { finalizeSyncJob, updateSyncJobStatus } from "./syncJobs";
import { buildRealtimeDomainEvent, publishRealtimeEvent } from "@/lib/micropulse/realtime";

function getWebhookSecret(provider: IntegrationProviderKey): string | null {
  const specific = process.env[`INTEGRATIONS_${provider}_WEBHOOK_SECRET`];
  if (specific && specific.length > 0) return specific;
  const shared = process.env.INTEGRATIONS_WEBHOOK_SECRET;
  return shared && shared.length > 0 ? shared : null;
}

function timingSafeEquals(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

/** Verifies webhook signature on server-side boundary before ingestion processing. */
export function verifyWebhookEvent(args: {
  provider: IntegrationProviderKey;
  bodyRaw: string;
  signature?: string | null;
  allowUnsigned?: boolean;
}): WebhookVerificationResult {
  const secret = getWebhookSecret(args.provider);
  if (!secret) {
    if (args.allowUnsigned) return { verified: true, reason: "No secret configured; unsigned mode allowed.", provider: args.provider };
    return { verified: false, reason: "No webhook secret configured.", provider: args.provider };
  }

  const signature = String(args.signature ?? "");
  if (!signature) return { verified: false, reason: "Missing webhook signature.", provider: args.provider };

  const expected = crypto.createHmac("sha256", secret).update(args.bodyRaw).digest("hex");
  const normalizedSignature = signature.replace(/^sha256=/, "");
  if (!timingSafeEquals(expected, normalizedSignature)) {
    return { verified: false, reason: "Invalid webhook signature.", provider: args.provider };
  }
  return { verified: true, reason: "Webhook signature verified.", provider: args.provider };
}

/** Registers webhook receipt as auditable event before/after verification. */
export function registerWebhookEvent(args: {
  provider: IntegrationProviderKey;
  connectionId?: string | null;
  verified: boolean;
  verificationSummary: string;
  eventType?: string | null;
  deliveryId?: string | null;
  rawReferenceId?: string | null;
  status?: WebhookEventRecord["status"];
  summary: string;
}): WebhookEventRecord {
  const saved = saveWebhookEvent({
    id: `webhook:${args.provider.toLowerCase()}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    provider: args.provider,
    connectionId: args.connectionId ?? null,
    receivedAt: new Date().toISOString(),
    verified: args.verified,
    verificationSummary: args.verificationSummary,
    eventType: args.eventType ?? null,
    deliveryId: args.deliveryId ?? null,
    rawReferenceId: args.rawReferenceId ?? null,
    status: args.status ?? (args.verified ? "VERIFIED" : "REJECTED"),
    summary: args.summary,
  });
  publishRealtimeEvent(
    buildRealtimeDomainEvent({
      type: "WEBHOOK_RECEIVED",
      scopeType: "INTEGRATION",
      scopeId: saved.provider,
      provider: saved.provider,
      summary: saved.summary,
      payload: {
        status: saved.status,
        verified: saved.verified,
        eventType: saved.eventType ?? null,
      },
      severity: saved.status === "REJECTED" ? "WARNING" : "INFO",
      dedupeKey: `webhook:${saved.provider}:${saved.deliveryId ?? saved.id}`,
    }),
  );
  return saved;
}

/** Processes verified webhook payload through Phase 13 ingestion and sync job status updates. */
export function processWebhookEvent(args: {
  job: SyncJobRecord;
  event: WebhookEventRecord;
  payload: unknown;
}): SyncExecutionResult {
  if (!args.event.verified) {
    const failed = finalizeSyncJob({
      job: args.job,
      status: "FAILED",
      summary: `Webhook processing rejected: ${args.event.verificationSummary}`,
      errorMessage: args.event.verificationSummary,
    });
    saveWebhookEvent({
      ...args.event,
      status: "REJECTED",
      summary: `Webhook rejected: ${args.event.verificationSummary}`,
    });
    return {
      jobId: failed.id,
      status: failed.status,
      importedCount: 0,
      failedCount: 1,
      warnings: [],
      errors: [args.event.verificationSummary],
      summary: failed.summary,
    };
  }

  const running = updateSyncJobStatus(args.job, "RUNNING");
  const ingested = ingestRawIntegrationPayload({
    provider: running.provider,
    payload: args.payload,
    importMode: "WEBHOOK_PUSH",
    connectionId: running.connectionId,
    sourceRef: args.event.deliveryId ?? args.event.id,
  });
  const status = ingested.record.status === "SUCCESS" ? "SUCCESS" : ingested.record.status === "PARTIAL" ? "PARTIAL" : "FAILED";
  const finished = finalizeSyncJob({
    job: running,
    status,
    summary: `Webhook processing ${status.toLowerCase()}: ${ingested.record.summary}`,
    importRecordId: ingested.record.id,
    payloadReferenceId: ingested.rawPayload.id,
    errorMessage: ingested.record.errors.join(" | ") || null,
  });
  saveWebhookEvent({
    ...args.event,
    status: status === "FAILED" ? "FAILED" : "PROCESSED",
    summary: finished.summary,
    rawReferenceId: ingested.rawPayload.id,
  });

  return {
    jobId: finished.id,
    status: finished.status,
    importedCount: ingested.record.importedCount,
    failedCount: ingested.record.failedCount,
    warnings: ingested.record.warnings,
    errors: ingested.record.errors,
    summary: finished.summary,
  };
}

/** Compact webhook event summary for status/history panels. */
export function summarizeWebhookEvent(event: WebhookEventRecord): string {
  return `${event.provider} webhook ${event.status.toLowerCase()}: ${event.summary}`;
}
