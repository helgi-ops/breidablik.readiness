import type { RetryPolicy, SyncJobRecord } from "./types";

/** Default retry policy for transient live provider sync failures. */
export function buildDefaultRetryPolicy(): RetryPolicy {
  return {
    maxAttempts: 3,
    baseDelaySeconds: 60,
    backoffMultiplier: 2,
    retryableStatuses: ["FAILED", "PARTIAL"],
  };
}

/** Computes exponential backoff retry timestamp for next sync attempt. */
export function computeNextRetryAt(args: {
  attemptCount: number;
  baseDelaySeconds: number;
  backoffMultiplier: number;
  now?: Date;
}): string {
  const now = args.now ?? new Date();
  const exponent = Math.max(0, args.attemptCount - 1);
  const delaySeconds = Math.round(args.baseDelaySeconds * Math.pow(args.backoffMultiplier, exponent));
  return new Date(now.getTime() + delaySeconds * 1000).toISOString();
}

/** Retry decision helper; avoids retry loops for non-retryable credential/signature failures. */
export function shouldRetrySyncJob(job: SyncJobRecord, policy: RetryPolicy, errorMessage?: string | null): boolean {
  if (!policy.retryableStatuses.includes(job.status)) return false;
  if (job.attemptCount >= policy.maxAttempts) return false;
  const msg = String(errorMessage ?? job.errorMessage ?? "").toLowerCase();
  if (msg.includes("invalid credential") || msg.includes("auth") || msg.includes("signature")) return false;
  return true;
}

/** Human-readable retry summary for job history and health panels. */
export function summarizeRetryDecision(args: { retry: boolean; retryAt?: string | null; reason: string }): string {
  if (!args.retry) return `No retry scheduled. ${args.reason}`;
  return `Retry scheduled at ${args.retryAt ?? "soon"}. ${args.reason}`;
}

