import type {
  ImportConflictRecord,
  IntegrationConnection,
  IntegrationImportRecord,
  NormalizedExternalMetric,
  PlayerMappingRecord,
  RawIntegrationPayload,
} from "./types";

const CONNECTIONS_KEY = "micropulse.integrations.connections.v1";
const RAW_PAYLOADS_KEY = "micropulse.integrations.rawPayloads.v1";
const METRICS_KEY = "micropulse.integrations.normalizedMetrics.v1";
const IMPORTS_KEY = "micropulse.integrations.importRecords.v1";
const MAPPINGS_KEY = "micropulse.integrations.playerMappings.v1";
const CONFLICTS_KEY = "micropulse.integrations.conflicts.v1";

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

/** Persistence boundary for integrations. Replace with API/DB services when provider auth/webhooks are wired. */
export function saveIntegrationConnection(connection: IntegrationConnection): IntegrationConnection {
  const all = loadIntegrationConnections();
  writeJson(CONNECTIONS_KEY, [connection, ...all.filter((item) => item.id !== connection.id)]);
  return connection;
}

export function loadIntegrationConnections(): IntegrationConnection[] {
  return readJson<IntegrationConnection[]>(CONNECTIONS_KEY, []);
}

export function saveRawIntegrationPayload(payload: RawIntegrationPayload): RawIntegrationPayload {
  const all = readJson<RawIntegrationPayload[]>(RAW_PAYLOADS_KEY, []);
  writeJson(RAW_PAYLOADS_KEY, [payload, ...all.filter((item) => item.id !== payload.id)].slice(0, 1000));
  return payload;
}

export function loadRawIntegrationPayloads(limit = 100): RawIntegrationPayload[] {
  return readJson<RawIntegrationPayload[]>(RAW_PAYLOADS_KEY, []).slice(0, limit);
}

export function saveNormalizedExternalMetrics(metrics: NormalizedExternalMetric[]): number {
  const all = readJson<NormalizedExternalMetric[]>(METRICS_KEY, []);
  writeJson(METRICS_KEY, [...metrics, ...all].slice(0, 25000));
  return metrics.length;
}

export function loadNormalizedExternalMetrics(limit = 500): NormalizedExternalMetric[] {
  return readJson<NormalizedExternalMetric[]>(METRICS_KEY, []).slice(0, limit);
}

export function saveImportRecord(record: IntegrationImportRecord): IntegrationImportRecord {
  const all = readJson<IntegrationImportRecord[]>(IMPORTS_KEY, []);
  writeJson(IMPORTS_KEY, [record, ...all.filter((item) => item.id !== record.id)].slice(0, 5000));
  return record;
}

export function loadImportHistory(limit = 200): IntegrationImportRecord[] {
  return readJson<IntegrationImportRecord[]>(IMPORTS_KEY, []).slice(0, limit);
}

export function savePlayerMappingRecord(record: PlayerMappingRecord): PlayerMappingRecord {
  const all = readJson<PlayerMappingRecord[]>(MAPPINGS_KEY, []);
  writeJson(MAPPINGS_KEY, [record, ...all.filter((item) => item.id !== record.id)]);
  return record;
}

export function loadPlayerMappingRecords(): PlayerMappingRecord[] {
  return readJson<PlayerMappingRecord[]>(MAPPINGS_KEY, []);
}

export function saveImportConflict(conflict: ImportConflictRecord): ImportConflictRecord {
  const all = readJson<ImportConflictRecord[]>(CONFLICTS_KEY, []);
  writeJson(CONFLICTS_KEY, [conflict, ...all.filter((item) => item.id !== conflict.id)].slice(0, 5000));
  return conflict;
}

export function loadImportConflicts(limit = 500): ImportConflictRecord[] {
  return readJson<ImportConflictRecord[]>(CONFLICTS_KEY, []).slice(0, limit);
}

