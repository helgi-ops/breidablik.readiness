import "server-only";

import type {
  ProviderConnectionRuntimeStatus,
  ProviderCredentialRecord,
  SyncJobRecord,
  WebhookEventRecord,
} from "./types";

type SyncHistoryEntry = {
  id: string;
  provider: string;
  status: string;
  summary: string;
  timestamp: string;
  jobId?: string | null;
};

type LiveStore = {
  credentials: ProviderCredentialRecord[];
  syncJobs: SyncJobRecord[];
  webhookEvents: WebhookEventRecord[];
  runtimeStatuses: ProviderConnectionRuntimeStatus[];
  syncHistory: SyncHistoryEntry[];
};

const STORE_KEY = "__MICROPULSE_INTEGRATIONS_LIVE_STORE__";

function getStore(): LiveStore {
  const globalScope = globalThis as unknown as Record<string, LiveStore | undefined>;
  if (!globalScope[STORE_KEY]) {
    globalScope[STORE_KEY] = {
      credentials: [],
      syncJobs: [],
      webhookEvents: [],
      runtimeStatuses: [],
      syncHistory: [],
    };
  }
  return globalScope[STORE_KEY] as LiveStore;
}

/** Server-side persistence boundary for live integration metadata and runtime orchestration state. */
export function saveProviderCredentialMetadata(record: ProviderCredentialRecord): ProviderCredentialRecord {
  const store = getStore();
  store.credentials = [record, ...store.credentials.filter((item) => item.id !== record.id)];
  return record;
}

export function loadProviderCredentialMetadata(provider?: string): ProviderCredentialRecord[] {
  const credentials = getStore().credentials;
  if (!provider) return [...credentials];
  return credentials.filter((item) => item.provider === provider);
}

export function saveSyncJob(record: SyncJobRecord): SyncJobRecord {
  const store = getStore();
  store.syncJobs = [record, ...store.syncJobs.filter((item) => item.id !== record.id)].slice(0, 5000);
  return record;
}

export function loadSyncJobs(provider?: string): SyncJobRecord[] {
  const jobs = getStore().syncJobs;
  if (!provider) return [...jobs];
  return jobs.filter((item) => item.provider === provider);
}

export function saveWebhookEvent(record: WebhookEventRecord): WebhookEventRecord {
  const store = getStore();
  store.webhookEvents = [record, ...store.webhookEvents.filter((item) => item.id !== record.id)].slice(0, 5000);
  return record;
}

export function loadWebhookEvents(provider?: string): WebhookEventRecord[] {
  const events = getStore().webhookEvents;
  if (!provider) return [...events];
  return events.filter((item) => item.provider === provider);
}

export function saveConnectionRuntimeStatus(record: ProviderConnectionRuntimeStatus): ProviderConnectionRuntimeStatus {
  const store = getStore();
  store.runtimeStatuses = [record, ...store.runtimeStatuses.filter((item) => item.provider !== record.provider)];
  return record;
}

export function loadConnectionRuntimeStatuses(provider?: string): ProviderConnectionRuntimeStatus[] {
  const statuses = getStore().runtimeStatuses;
  if (!provider) return [...statuses];
  return statuses.filter((item) => item.provider === provider);
}

export function saveSyncHistoryEntry(entry: SyncHistoryEntry): SyncHistoryEntry {
  const store = getStore();
  store.syncHistory = [entry, ...store.syncHistory.filter((item) => item.id !== entry.id)].slice(0, 5000);
  return entry;
}

export function loadSyncHistory(provider?: string): SyncHistoryEntry[] {
  const history = getStore().syncHistory;
  if (!provider) return [...history];
  return history.filter((item) => item.provider === provider);
}

