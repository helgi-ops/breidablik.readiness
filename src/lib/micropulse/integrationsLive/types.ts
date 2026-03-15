import type { IntegrationProviderKey } from "@/lib/micropulse/integrations";

export type ProviderAuthMode = "OAUTH" | "API_KEY" | "TOKEN" | "WEBHOOK_SECRET" | "MANUAL";

export type ProviderConnectionLifecycleStatus = "NOT_CONNECTED" | "AUTH_PENDING" | "CONNECTED" | "EXPIRED" | "ERROR" | "DISABLED";

export type SyncJobStatus = "QUEUED" | "RUNNING" | "SUCCESS" | "PARTIAL" | "FAILED" | "RETRYING" | "CANCELLED";

export type SyncJobType = "PULL_SYNC" | "WEBHOOK_PROCESS" | "MANUAL_SYNC" | "BACKFILL";

export type RetryPolicy = {
  maxAttempts: number;
  baseDelaySeconds: number;
  backoffMultiplier: number;
  retryableStatuses: SyncJobStatus[];
};

/** Metadata-only credential record. Raw secrets/tokens remain server-only and out of UI payloads. */
export type ProviderCredentialRecord = {
  id: string;
  provider: IntegrationProviderKey;
  organizationId?: string | null;
  teamId?: string | null;
  authMode: ProviderAuthMode;
  status: ProviderConnectionLifecycleStatus;
  lastValidatedAt?: string | null;
  expiresAt?: string | null;
  credentialSummary?: string | null;
  hasRefreshToken?: boolean;
  hasWebhookSecret?: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
  enabled: boolean;
};

export type ProviderConnectionRuntimeStatus = {
  provider: IntegrationProviderKey;
  connectionId?: string | null;
  lifecycleStatus: ProviderConnectionLifecycleStatus;
  lastSyncAt?: string | null;
  lastSuccessAt?: string | null;
  lastFailureAt?: string | null;
  consecutiveFailures?: number | null;
  webhookConfigured?: boolean;
  pullSyncEnabled?: boolean;
  summary: string;
};

export type SyncJobRecord = {
  id: string;
  provider: IntegrationProviderKey;
  connectionId?: string | null;
  organizationId?: string | null;
  teamId?: string | null;
  jobType: SyncJobType;
  status: SyncJobStatus;
  startedAt?: string | null;
  completedAt?: string | null;
  attemptCount: number;
  maxAttempts: number;
  triggerSource: "SCHEDULE" | "MANUAL" | "WEBHOOK" | "BACKFILL";
  payloadReferenceId?: string | null;
  importRecordId?: string | null;
  summary: string;
  errorMessage?: string | null;
  retryAt?: string | null;
};

export type WebhookEventRecord = {
  id: string;
  provider: IntegrationProviderKey;
  connectionId?: string | null;
  receivedAt?: string | null;
  verified: boolean;
  verificationSummary: string;
  eventType?: string | null;
  deliveryId?: string | null;
  rawReferenceId?: string | null;
  status: "RECEIVED" | "VERIFIED" | "REJECTED" | "PROCESSED" | "FAILED";
  summary: string;
};

export type SyncHealthSummary = {
  connectedProviders: number;
  healthyConnections: number;
  degradedConnections: number;
  failingConnections: number;
  queuedJobs: number;
  runningJobs: number;
  failedRecentJobs: number;
  webhookFailures: number;
  summaryText: string;
};

export type WebhookVerificationResult = {
  verified: boolean;
  reason: string;
  provider: IntegrationProviderKey;
};

export type SyncExecutionResult = {
  jobId: string;
  status: SyncJobStatus;
  importedCount: number;
  failedCount: number;
  warnings: string[];
  errors: string[];
  summary: string;
};

export type LiveSyncContext = {
  provider: IntegrationProviderKey;
  connectionId?: string | null;
  organizationId?: string | null;
  teamId?: string | null;
};

