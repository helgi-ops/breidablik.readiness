export type IntegrationProviderKey = "WHOOP" | "VALD" | "CATAPULT" | "POLAR" | "GARMIN" | "GENERIC_CSV";

export type IntegrationConnectionStatus = "DISCONNECTED" | "CONNECTED" | "PENDING" | "ERROR" | "DISABLED";

export type IntegrationImportMode = "MANUAL_UPLOAD" | "API_PULL" | "WEBHOOK_PUSH" | "CSV_IMPORT";

export type ExternalMetricCategory =
  | "RECOVERY"
  | "READINESS"
  | "SLEEP"
  | "LOAD"
  | "GPS"
  | "FORCE"
  | "WELLNESS"
  | "SESSION"
  | "HEART_RATE"
  | "CUSTOM";

export type IntegrationConnection = {
  id: string;
  provider: IntegrationProviderKey;
  organizationId?: string | null;
  teamId?: string | null;
  status: IntegrationConnectionStatus;
  displayName?: string | null;
  lastSyncAt?: string | null;
  lastSuccessAt?: string | null;
  lastErrorAt?: string | null;
  lastErrorMessage?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  enabled: boolean;
  configSummary?: string | null;
};

export type ExternalPlayerReference = {
  provider: IntegrationProviderKey;
  externalAthleteId?: string | null;
  externalAthleteName?: string | null;
  externalTeamId?: string | null;
  externalTeamName?: string | null;
};

export type PlayerMappingRecord = {
  id: string;
  provider: IntegrationProviderKey;
  internalPlayerId: string;
  internalPlayerName?: string | null;
  externalAthleteId?: string | null;
  externalAthleteName?: string | null;
  confidence: number;
  status: "MAPPED" | "PENDING" | "CONFLICT" | "UNMATCHED";
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type RawIntegrationPayload = {
  id: string;
  provider: IntegrationProviderKey;
  connectionId?: string | null;
  importMode: IntegrationImportMode;
  receivedAt?: string | null;
  sourceRef?: string | null;
  payload: unknown;
};

export type NormalizedExternalMetric = {
  provider: IntegrationProviderKey;
  category: ExternalMetricCategory;
  playerId?: string | null;
  playerName?: string | null;
  externalAthleteId?: string | null;
  timestamp?: string | null;
  metricKey: string;
  metricLabel?: string | null;
  numericValue?: number | null;
  textValue?: string | null;
  unit?: string | null;
  sourceRef?: string | null;
  confidence?: number | null;
  metadata?: Record<string, unknown> | null;
};

export type IntegrationImportRecord = {
  id: string;
  provider: IntegrationProviderKey;
  connectionId?: string | null;
  importMode: IntegrationImportMode;
  startedAt?: string | null;
  completedAt?: string | null;
  status: "PENDING" | "SUCCESS" | "PARTIAL" | "FAILED";
  importedCount: number;
  failedCount: number;
  unmatchedCount: number;
  warnings: string[];
  errors: string[];
  summary: string;
};

export type ImportConflictRecord = {
  id: string;
  provider: IntegrationProviderKey;
  type:
    | "PLAYER_UNMATCHED"
    | "DUPLICATE_MAPPING"
    | "INVALID_METRIC"
    | "MISSING_TIMESTAMP"
    | "UNSUPPORTED_PAYLOAD"
    | "TEAM_MISMATCH";
  severity: "LOW" | "MODERATE" | "HIGH";
  summary: string;
  rawReferenceId?: string | null;
  playerName?: string | null;
  externalAthleteId?: string | null;
  details?: Record<string, unknown> | null;
  createdAt?: string | null;
};

export type IntegrationStatusSummary = {
  connectedProviders: number;
  providersWithErrors: number;
  recentSuccessfulImports: number;
  recentFailedImports: number;
  unresolvedConflicts: number;
  summaryText: string;
};

export type ProviderAdapterResult = {
  normalizedMetrics: NormalizedExternalMetric[];
  conflicts: ImportConflictRecord[];
  warnings: string[];
  summary: string;
};

export type IntegrationProviderDescriptor = {
  provider: IntegrationProviderKey;
  displayName: string;
  supportedModes: IntegrationImportMode[];
  supportedCategories: ExternalMetricCategory[];
  requiresPlayerMapping: boolean;
  description?: string | null;
};
