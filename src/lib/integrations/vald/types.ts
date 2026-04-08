export type ValdAuthMode = "api_key" | "oauth" | "unknown";
export type ValdProduct = "forcedecks" | "nordbord" | "forceframe" | "unknown";

/** VALD data-centre region — determines the product API base URL. */
export type ValdRegion = "aue" | "use" | "euw";

export type ValdConnectionConfig = {
  baseUrl: string;
  authMode: ValdAuthMode;
  clientId?: string | null;
  clientSecret?: string | null;
  apiKey?: string | null;
  accessToken?: string | null;
  refreshToken?: string | null;
  tokenExpiresAt?: string | null;
  orgId?: string | null;
  /** VALD tenant ID — required for ForceDecks/NordBord API requests. */
  tenantId?: string | null;
  /**
   * VALD squad/team ID — the specific team within the tenant to sync.
   * Used as the {teamId} path parameter in /v2019q3/teams/{teamId}/athletes.
   * When set this overrides tenantId for athlete/test endpoints, allowing
   * you to sync only one squad (e.g. men's team) instead of all athletes.
   */
  valdTeamId?: string | null;
  /** Data-centre region. Determines the product API base URL when baseUrl is not overridden. */
  region?: ValdRegion | null;
  /** Token endpoint URL. Defaults to VALD_TOKEN_URL constant. */
  tokenUrl?: string | null;
  timeoutMs?: number;
  defaultHeaders?: Record<string, string>;
  endpointOverrides?: Partial<{
    athletes: string;
    tests: string;
    athleteTests: string;
    token: string;
  }>;
};

export type ValdTokenResponse = {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: string | null;
  raw?: unknown;
};

export type ValdAthleteSummary = {
  athleteId: string;
  fullName?: string | null;
  email?: string | null;
  externalRef?: string | null;
  teamName?: string | null;
  groupName?: string | null;
  genderLabel?: string | null;
  raw?: unknown;
};

export type ValdTestSummary = {
  testId: string;
  athleteId: string;
  product: ValdProduct;
  testType?: string | null;
  testTimestamp: string;
  sourceUpdatedAt?: string | null;
  raw: unknown;
};

export type ValdRawTestRecord = {
  valdTestId: string;
  valdAthleteId: string;
  product: ValdProduct;
  testType?: string | null;
  testTimestamp: string;
  sourceUpdatedAt?: string | null;
  payload: unknown;
  payloadHash: string;
  ingestionKey: string;
};

export type ValdForceDecksNormalizedResult = {
  product: "forcedecks";
  testType?: string | null;
  testTimestamp: string;
  jumpHeightCm?: number | null;
  rsiMod?: number | null;
  eccentricDurationMs?: number | null;
  concentricDurationMs?: number | null;
  peakPowerW?: number | null;
  relativePeakPowerWKg?: number | null;
  peakForceN?: number | null;
  concentricImpulseNS?: number | null;
  timeToTakeoffMs?: number | null;
  leftValue?: number | null;
  rightValue?: number | null;
  asymmetryPercent?: number | null;
  asymmetrySide?: "left" | "right" | null;
  isValid: boolean;
};

export type ValdNordBordNormalizedResult = {
  product: "nordbord";
  testType?: string | null;
  testTimestamp: string;
  leftPeakForceN?: number | null;
  rightPeakForceN?: number | null;
  leftAvgForceN?: number | null;
  rightAvgForceN?: number | null;
  asymmetryPercent?: number | null;
  asymmetrySide?: "left" | "right" | null;
  isValid: boolean;
};

export type ValdForceFrameNormalizedResult = {
  product: "forceframe";
  testType?: string | null;
  testTimestamp: string;
  bodyRegion?: string | null;
  movementPattern?: string | null;
  leftPeakForceN?: number | null;
  rightPeakForceN?: number | null;
  leftRelativeForce?: number | null;
  rightRelativeForce?: number | null;
  asymmetryPercent?: number | null;
  asymmetrySide?: "left" | "right" | null;
  isValid: boolean;
};

export type ValdSyncRequest = {
  teamId: string;
  accountId?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  athleteIds?: string[] | null;
  syncType?: "latest" | "date_range" | "athlete_backfill" | "manual" | "scheduled";
  requestedBy?: string | null;
  forceReprocess?: boolean;
};

export type ValdSyncResult = {
  syncRunId?: string | null;
  status: "queued" | "running" | "partial" | "success" | "failed";
  summary: Record<string, number | string | boolean | null>;
  warnings: string[];
  errors: string[];
};

export type ValdAthleteMatchCandidate = {
  valdAthleteId: string;
  valdAthleteName?: string | null;
  valdEmail?: string | null;
  valdExternalRef?: string | null;
  microplayerId?: string | null;
  microplayerName?: string | null;
  confidence?: number | null;
  matchSource?: "manual" | "email" | "external_id" | "name_fuzzy" | null;
};

export interface ValdProvider {
  testConnection(): Promise<{ ok: boolean; diagnostics?: Record<string, unknown> }>;
  fetchAthletes(): Promise<ValdAthleteSummary[]>;
  fetchTestsByDateRange(dateFrom: string, dateTo: string): Promise<ValdTestSummary[]>;
  fetchTestsForAthlete(valdAthleteId: string, dateFrom: string, dateTo: string): Promise<ValdTestSummary[]>;
  getDiagnostics(): string[];
  normalizeRawTest(payload: unknown): Promise<
    ValdForceDecksNormalizedResult | ValdNordBordNormalizedResult | ValdForceFrameNormalizedResult | null
  >;
  normalizeForceDecksTrials(payload: unknown): Array<ValdForceDecksNormalizedResult & { trialNumber: number }>;
  getProductFromPayload(payload: unknown): ValdProduct;
}
