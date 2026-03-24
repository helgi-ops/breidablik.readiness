import type { ValdAthleteSummary, ValdProduct, ValdTestSummary, ValdTokenResponse } from "./types";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export function mapValdTokenResponse(payload: unknown): ValdTokenResponse {
  const record = asRecord(payload) ?? {};
  // VALD (March 2026) returns expires_in (integer seconds), not expires_at.
  // Convert to an absolute ISO timestamp so we can reliably check expiry.
  const expiresIn = typeof record.expires_in === "number" && Number.isFinite(record.expires_in)
    ? record.expires_in
    : null;
  const expiresAt = expiresIn != null
    ? new Date(Date.now() + expiresIn * 1000).toISOString()
    : firstString(record.expires_at, record.expiresAt);
  return {
    accessToken: firstString(record.access_token, record.accessToken) ?? "",
    refreshToken: firstString(record.refresh_token, record.refreshToken),
    expiresAt,
    raw: payload,
  };
}

/**
 * Infers the VALD product from the testType field returned by the API.
 * VALD ForceDecks test types: CounterMovementJump, SquatJump, DropJump, IMTP, etc.
 * VALD NordBord test types: NordicHamstringCurl, etc.
 * VALD ForceFrame test types: IsometricStrength, etc.
 */
export function inferValdProductFromTestType(payload: unknown): ValdProduct | null {
  const record = asRecord(payload);
  if (!record) return null;
  const testType = firstString(record.testType, record.test_type)?.toLowerCase();
  if (!testType) return null;
  // ForceDecks jump / force tests
  if (
    testType.includes("countermovement") ||
    testType.includes("squatjump") ||
    testType.includes("dropjump") ||
    testType.includes("imtp") ||
    testType.includes("sqj") ||
    testType.includes("cmj")
  ) return "forcedecks";
  // NordBord
  if (testType.includes("nordic") || testType.includes("nordbord") || testType.includes("hamstring")) return "nordbord";
  // ForceFrame
  if (testType.includes("forceframe") || testType.includes("force_frame") || testType.includes("isometric")) return "forceframe";
  return null;
}

export function inferValdProductFromPayload(payload: unknown): ValdProduct {
  // First try the structured testType field (VALD REST API v2+)
  const fromTestType = inferValdProductFromTestType(payload);
  if (fromTestType) return fromTestType;

  const record = asRecord(payload);
  const source = firstString(
    record?.product,
    record?.device,
    record?.productType,
    record?.sourceProduct,
    record?.test_category,
  )?.toLowerCase();
  if (!source) return "unknown";
  if (source.includes("force") && source.includes("deck")) return "forcedecks";
  if (source.includes("nord")) return "nordbord";
  if (source.includes("frame")) return "forceframe";
  return "unknown";
}

export function mapValdAthleteSummary(payload: unknown): ValdAthleteSummary | null {
  const record = asRecord(payload);
  if (!record) return null;
  // VALD Profiles API: profileId is the primary identifier (not athleteId / id)
  const athleteId = firstString(record.profileId, record.id, record.athlete_id, record.athleteId);
  if (!athleteId) return null;
  const firstName = firstString(record.firstName, record.first_name);
  const lastName = firstString(record.lastName, record.last_name);
  return {
    athleteId,
    fullName: firstString(record.fullName, record.full_name) ?? ([firstName, lastName].filter(Boolean).join(" ") || null),
    email: firstString(record.email),
    externalRef: firstString(record.externalId, record.external_ref, record.externalRef, record.reference),
    raw: payload,
  };
}

export function mapValdTestSummary(payload: unknown): ValdTestSummary | null {
  const record = asRecord(payload);
  if (!record) return null;
  // VALD ForceDecks API (March 2026): testId, profileId, recordedDateUtc, modifiedDateUtc
  const testId = firstString(record.testId, record.id, record.test_id);
  // profileId is the athlete identifier in VALD ForceDecks REST API
  const athleteId = firstString(record.profileId, record.athlete_id, record.athleteId);
  const testTimestamp = firstString(
    record.recordedDateUtc,
    record.test_timestamp,
    record.testTimestamp,
    record.performed_at,
    record.created_at,
  );
  if (!testId || !athleteId || !testTimestamp) return null;
  return {
    testId,
    athleteId,
    product: inferValdProductFromPayload(payload),
    testType: firstString(record.testType, record.test_type, record.protocol, record.name),
    testTimestamp,
    // modifiedDateUtc is the cursor field for incremental sync
    sourceUpdatedAt: firstString(record.modifiedDateUtc, record.updated_at, record.source_updated_at, record.sourceUpdatedAt),
    raw: payload,
  };
}
