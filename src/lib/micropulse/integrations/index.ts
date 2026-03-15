export type {
  IntegrationProviderKey,
  IntegrationConnectionStatus,
  IntegrationImportMode,
  ExternalMetricCategory,
  IntegrationConnection,
  ExternalPlayerReference,
  PlayerMappingRecord,
  RawIntegrationPayload,
  NormalizedExternalMetric,
  IntegrationImportRecord,
  ImportConflictRecord,
  IntegrationStatusSummary,
  ProviderAdapterResult,
  IntegrationProviderDescriptor,
} from "./types";

export { INTEGRATION_PROVIDERS, getProviderDescriptor, listProviderDescriptors } from "./providers";
export { getProviderAdapter, getAvailableProviderDescriptors } from "./registry";

export {
  buildPlayerMappingCandidate,
  resolvePlayerMapping,
  summarizePlayerMapping,
  detectDuplicateMappings,
  type InternalPlayerCandidate,
  type PlayerMappingCandidate,
} from "./playerMapping";

export {
  buildNormalizedExternalMetrics,
  attachInternalPlayerIds,
  summarizeNormalizedMetrics,
} from "./normalize";

export {
  validateNormalizedMetric,
  validateProviderAdapterResult,
  validateImportBatch,
  type MetricValidationResult,
} from "./validate";

export { buildImportConflict, summarizeImportConflicts, groupImportConflictsByType } from "./conflicts";

export { buildImportHistoryEntry, summarizeImportHistory, listRecentImportSummaries } from "./history";

export {
  buildIntegrationStatusSummary,
  summarizeConnectionHealth,
  summarizeRecentImports,
} from "./status";

export {
  buildIntegrationImportRecord,
  ingestProviderPayload,
  ingestRawIntegrationPayload,
  type IngestOptions,
} from "./ingest";

export {
  saveIntegrationConnection,
  loadIntegrationConnections,
  saveRawIntegrationPayload,
  loadRawIntegrationPayloads,
  saveNormalizedExternalMetrics,
  loadNormalizedExternalMetrics,
  saveImportRecord,
  loadImportHistory,
  savePlayerMappingRecord,
  loadPlayerMappingRecords,
  saveImportConflict,
  loadImportConflicts,
} from "./persistence";

