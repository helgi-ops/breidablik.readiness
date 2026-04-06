import type { IntegrationProviderKey } from "@/lib/micropulse/integrations";
import type {
  ProviderConnectionRuntimeStatus,
  ProviderCredentialRecord,
  SyncHealthSummary,
  SyncJobRecord,
  WebhookEventRecord,
} from "./types";

/** Builds runtime status for one provider from credential + recent job outcomes. */
export function buildConnectionRuntimeStatus(args: {
  provider: IntegrationProviderKey;
  credential?: ProviderCredentialRecord | null;
  jobs: SyncJobRecord[];
  webhookEvents?: WebhookEventRecord[];
  connectionId?: string | null;
}): ProviderConnectionRuntimeStatus {
  const jobs = [...args.jobs].sort((a, b) => String(b.completedAt ?? b.startedAt ?? "").localeCompare(String(a.completedAt ?? a.startedAt ?? "")));
  const last = jobs[0];
  const lastSuccess = jobs.find((job) => job.status === "SUCCESS" || job.status === "PARTIAL");
  const consecutiveFailures = jobs.reduce((count, job) => {
    if (job.status === "FAILED") return count + 1;
    return count;
  }, 0);

  const lifecycleStatus = args.credential?.status ?? "NOT_CONNECTED";
  const webhookConfigured = Boolean(args.credential?.hasWebhookSecret);
  const pullSyncEnabled = Boolean(args.credential?.enabled);

  const summary = `${args.provider}: ${lifecycleStatus.toLowerCase().replaceAll("_", " ")}${
    consecutiveFailures ? `, ${consecutiveFailures} recent failure(s)` : ""
  }.`;

  return {
    provider: args.provider,
    connectionId: args.connectionId ?? args.credential?.id ?? null,
    lifecycleStatus,
    lastSyncAt: last?.completedAt ?? last?.startedAt ?? null,
    lastSuccessAt: lastSuccess?.completedAt ?? null,
    lastFailureAt: jobs.find((job) => job.status === "FAILED")?.completedAt ?? null,
    consecutiveFailures,
    webhookConfigured,
    pullSyncEnabled,
    summary,
  };
}

/** Condensed connection health line for UI and operational reporting. */
export function summarizeConnectionHealth(statuses: ProviderConnectionRuntimeStatus[]): string {
  if (!statuses.length) return "No live provider runtime status available.";
  const healthy = statuses.filter((item) => item.lifecycleStatus === "CONNECTED" && (item.consecutiveFailures ?? 0) < 2).length;
  const degraded = statuses.filter((item) => item.lifecycleStatus === "CONNECTED" && (item.consecutiveFailures ?? 0) >= 2).length;
  const failing = statuses.filter((item) => item.lifecycleStatus === "ERROR" || item.lifecycleStatus === "EXPIRED").length;
  return `${healthy} healthy, ${degraded} degraded, ${failing} failing connections.`;
}

/** Returns providers needing attention based on failing lifecycle or repeated failures. */
export function listConnectionsNeedingAttention(statuses: ProviderConnectionRuntimeStatus[]): ProviderConnectionRuntimeStatus[] {
  return statuses.filter(
    (item) =>
      item.lifecycleStatus === "ERROR" ||
      item.lifecycleStatus === "EXPIRED" ||
      item.lifecycleStatus === "AUTH_PENDING" ||
      (item.consecutiveFailures ?? 0) >= 2,
  );
}

/** Aggregates live sync health across connections/jobs/webhook events. */
export function buildSyncHealthSummary(args: {
  statuses: ProviderConnectionRuntimeStatus[];
  jobs: SyncJobRecord[];
  webhookEvents: WebhookEventRecord[];
}): SyncHealthSummary {
  const { statuses, jobs, webhookEvents } = args;
  const connectedProviders = statuses.filter((item) => item.lifecycleStatus === "CONNECTED").length;
  const healthyConnections = statuses.filter((item) => item.lifecycleStatus === "CONNECTED" && (item.consecutiveFailures ?? 0) < 2).length;
  const degradedConnections = statuses.filter((item) => item.lifecycleStatus === "CONNECTED" && (item.consecutiveFailures ?? 0) >= 2).length;
  const failingConnections = statuses.filter((item) => item.lifecycleStatus === "ERROR" || item.lifecycleStatus === "EXPIRED").length;
  const queuedJobs = jobs.filter((job) => job.status === "QUEUED" || job.status === "RETRYING").length;
  const runningJobs = jobs.filter((job) => job.status === "RUNNING").length;
  const failedRecentJobs = jobs
    .sort((a, b) => String(b.completedAt ?? "").localeCompare(String(a.completedAt ?? "")))
    .slice(0, 30)
    .filter((job) => job.status === "FAILED").length;
  const webhookFailures = webhookEvents
    .sort((a, b) => String(b.receivedAt ?? "").localeCompare(String(a.receivedAt ?? "")))
    .slice(0, 50)
    .filter((event) => event.status === "FAILED" || event.status === "REJECTED").length;

  return {
    connectedProviders,
    healthyConnections,
    degradedConnections,
    failingConnections,
    queuedJobs,
    runningJobs,
    failedRecentJobs,
    webhookFailures,
    summaryText: `${summarizeConnectionHealth(statuses)} ${failedRecentJobs} recent failed job(s), ${webhookFailures} webhook failure(s).`,
  };
}

