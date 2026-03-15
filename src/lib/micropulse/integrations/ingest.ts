import type {
  ImportConflictRecord,
  IntegrationImportMode,
  IntegrationImportRecord,
  IntegrationProviderKey,
  NormalizedExternalMetric,
  PlayerMappingRecord,
  RawIntegrationPayload,
} from "./types";
import { getProviderAdapter } from "./registry";
import { attachInternalPlayerIds, buildNormalizedExternalMetrics, summarizeNormalizedMetrics } from "./normalize";
import { validateImportBatch, validateProviderAdapterResult } from "./validate";
import { detectDuplicateMappings, type InternalPlayerCandidate } from "./playerMapping";
import {
  loadPlayerMappingRecords,
  saveImportConflict,
  saveImportRecord,
  saveNormalizedExternalMetrics,
  savePlayerMappingRecord,
  saveRawIntegrationPayload,
} from "./persistence";
import { buildIntegrationImportCompletedEvent, buildRealtimeDomainEvent, publishRealtimeEvent } from "@/lib/micropulse/realtime";

export type IngestOptions = {
  internalPlayers?: InternalPlayerCandidate[];
  existingMappings?: PlayerMappingRecord[];
};

/** Builds a deterministic import record so partial-success imports remain auditable. */
export function buildIntegrationImportRecord(args: {
  provider: IntegrationProviderKey;
  connectionId?: string | null;
  importMode: IntegrationImportMode;
  startedAt?: string;
  completedAt?: string;
  importedCount: number;
  failedCount: number;
  unmatchedCount: number;
  warnings: string[];
  errors: string[];
}): IntegrationImportRecord {
  const { provider, connectionId, importMode, importedCount, failedCount, unmatchedCount, warnings, errors } = args;
  const status: IntegrationImportRecord["status"] =
    failedCount > 0 && importedCount === 0
      ? "FAILED"
      : failedCount > 0 || unmatchedCount > 0 || warnings.length > 0
        ? "PARTIAL"
        : "SUCCESS";

  return {
    id: `import:${provider}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    provider,
    connectionId: connectionId ?? null,
    importMode,
    startedAt: args.startedAt ?? new Date().toISOString(),
    completedAt: args.completedAt ?? new Date().toISOString(),
    status,
    importedCount,
    failedCount,
    unmatchedCount,
    warnings,
    errors,
    summary: `${provider} import ${status.toLowerCase()}: ${importedCount} imported, ${failedCount} failed, ${unmatchedCount} unmatched.`,
  };
}

/** Ingests a payload with provider-specific adapter normalization and canonical persistence handoff. */
export function ingestProviderPayload(rawPayload: RawIntegrationPayload, options: IngestOptions = {}): {
  record: IntegrationImportRecord;
  metrics: NormalizedExternalMetric[];
  conflicts: ImportConflictRecord[];
} {
  const startedAt = new Date().toISOString();
  saveRawIntegrationPayload(rawPayload);

  const adapter = getProviderAdapter(rawPayload.provider);
  const adapted = adapter.normalize(rawPayload);
  const adapterValidation = validateProviderAdapterResult(adapted);

  const normalized = buildNormalizedExternalMetrics(adapted);
  const mappingRecords = options.existingMappings ?? loadPlayerMappingRecords();
  const mappingAttachment = attachInternalPlayerIds({
    provider: rawPayload.provider,
    metrics: normalized,
    mappingRecords,
    internalPlayers: options.internalPlayers ?? [],
  });

  for (const mapping of mappingAttachment.mappingUpdates) {
    savePlayerMappingRecord(mapping);
  }

  const duplicateMappingConflicts = detectDuplicateMappings([...mappingRecords, ...mappingAttachment.mappingUpdates]);
  const validation = validateImportBatch(mappingAttachment.metrics);

  const allConflicts = [
    ...adapted.conflicts,
    ...mappingAttachment.conflicts,
    ...duplicateMappingConflicts,
    ...validation.conflicts,
  ];

  for (const conflict of allConflicts) {
    saveImportConflict(conflict);
  }

  saveNormalizedExternalMetrics(validation.validMetrics);

  const warnings = [...adapted.warnings, ...adapterValidation.warnings, ...validation.warnings];
  const errors = [...adapterValidation.errors, ...validation.errors];
  const unmatchedCount = mappingAttachment.metrics.filter((metric) => !metric.playerId && !!metric.externalAthleteId).length;
  const failedCount = validation.errors.length;

  const record = buildIntegrationImportRecord({
    provider: rawPayload.provider,
    connectionId: rawPayload.connectionId ?? null,
    importMode: rawPayload.importMode,
    startedAt,
    completedAt: new Date().toISOString(),
    importedCount: validation.validMetrics.length,
    failedCount,
    unmatchedCount,
    warnings,
    errors,
  });

  record.summary = `${record.summary} ${summarizeNormalizedMetrics(validation.validMetrics)}`;
  saveImportRecord(record);
  if (record.status === "FAILED") {
    publishRealtimeEvent(
      buildRealtimeDomainEvent({
        type: "INTEGRATION_IMPORT_FAILED",
        scopeType: "INTEGRATION",
        scopeId: record.provider,
        provider: record.provider,
        summary: `${record.provider} import failed.`,
        payload: {
          failedCount: record.failedCount,
          unmatchedCount: record.unmatchedCount,
          errors: record.errors.slice(0, 3),
        },
        severity: "WARNING",
        dedupeKey: `import_failed:${record.provider}:${record.id}`,
      }),
    );
  } else {
    publishRealtimeEvent(
      buildIntegrationImportCompletedEvent({
        provider: record.provider,
        summary: `${record.provider} import ${record.status.toLowerCase()}: ${record.importedCount} imported.`,
        payload: {
          status: record.status,
          importedCount: record.importedCount,
          failedCount: record.failedCount,
          unmatchedCount: record.unmatchedCount,
        },
      }),
    );
  }

  return {
    record,
    metrics: validation.validMetrics,
    conflicts: allConflicts,
  };
}

/** Entry helper for manual/API/webhook raw payload ingestion into the adapter pipeline. */
export function ingestRawIntegrationPayload(args: {
  provider: IntegrationProviderKey;
  payload: unknown;
  importMode?: IntegrationImportMode;
  connectionId?: string | null;
  sourceRef?: string | null;
  internalPlayers?: InternalPlayerCandidate[];
  existingMappings?: PlayerMappingRecord[];
}): {
  rawPayload: RawIntegrationPayload;
  record: IntegrationImportRecord;
  metrics: NormalizedExternalMetric[];
  conflicts: ImportConflictRecord[];
} {
  const rawPayload: RawIntegrationPayload = {
    id: `raw:${args.provider}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    provider: args.provider,
    connectionId: args.connectionId ?? null,
    importMode: args.importMode ?? "MANUAL_UPLOAD",
    receivedAt: new Date().toISOString(),
    sourceRef: args.sourceRef ?? null,
    payload: args.payload,
  };

  const result = ingestProviderPayload(rawPayload, {
    internalPlayers: args.internalPlayers,
    existingMappings: args.existingMappings,
  });
  return { rawPayload, ...result };
}
