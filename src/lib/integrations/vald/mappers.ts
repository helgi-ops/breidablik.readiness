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
  return {
    accessToken: firstString(record.access_token, record.accessToken) ?? "",
    refreshToken: firstString(record.refresh_token, record.refreshToken),
    expiresAt: firstString(record.expires_at, record.expiresAt),
    raw: payload,
  };
}

export function inferValdProductFromPayload(payload: unknown): ValdProduct {
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
  // TODO: VERIFY AGAINST VALD API DOCS
  const athleteId = firstString(record.id, record.athlete_id, record.athleteId);
  if (!athleteId) return null;
  const firstName = firstString(record.first_name, record.firstName);
  const lastName = firstString(record.last_name, record.lastName);
  return {
    athleteId,
    fullName: firstString(record.full_name, record.fullName) ?? ([firstName, lastName].filter(Boolean).join(" ") || null),
    email: firstString(record.email),
    externalRef: firstString(record.external_ref, record.externalRef, record.reference),
    raw: payload,
  };
}

export function mapValdTestSummary(payload: unknown): ValdTestSummary | null {
  const record = asRecord(payload);
  if (!record) return null;
  // TODO: VERIFY AGAINST VALD API DOCS
  const testId = firstString(record.id, record.test_id, record.testId);
  const athleteId = firstString(record.athlete_id, record.athleteId);
  const testTimestamp = firstString(record.test_timestamp, record.testTimestamp, record.performed_at, record.created_at);
  if (!testId || !athleteId || !testTimestamp) return null;
  return {
    testId,
    athleteId,
    product: inferValdProductFromPayload(payload),
    testType: firstString(record.test_type, record.testType, record.protocol, record.name),
    testTimestamp,
    sourceUpdatedAt: firstString(record.updated_at, record.source_updated_at, record.sourceUpdatedAt),
    raw: payload,
  };
}
